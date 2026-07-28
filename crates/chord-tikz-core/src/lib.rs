use std::collections::BTreeMap;
use std::fmt::Write;
use std::sync::Mutex;

mod preprocess;

use preprocess::{evaluate_numeric_expression, preprocess};

const UNIT: f64 = 37.795_275_590_6;
const TEX_POINT: f64 = 96.0 / 72.27;
const DISPLAY_SCALE: f64 = 1.5;
const MAX_SOURCE_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
static RESULT: Mutex<Vec<u8>> = Mutex::new(Vec::new());

#[unsafe(no_mangle)]
pub extern "C" fn chord_tikz_alloc(length: usize) -> *mut u8 {
    if length == 0 || length > MAX_SOURCE_BYTES {
        return std::ptr::null_mut();
    }
    let mut bytes = Vec::<u8>::with_capacity(length);
    let pointer = bytes.as_mut_ptr();
    std::mem::forget(bytes);
    pointer
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chord_tikz_dealloc(pointer: *mut u8, length: usize) {
    if !pointer.is_null() && length > 0 && length <= MAX_SOURCE_BYTES {
        // SAFETY: The pointer and capacity originate from chord_tikz_alloc.
        unsafe {
            drop(Vec::from_raw_parts(pointer, 0, length));
        }
    }
}

#[unsafe(no_mangle)]
pub unsafe extern "C" fn chord_tikz_render(pointer: *const u8, length: usize) -> i32 {
    let rendered = if pointer.is_null() || length == 0 || length > MAX_SOURCE_BYTES {
        Err("TikZ source must contain between 1 byte and 64 KiB.".to_owned())
    } else {
        // SAFETY: The caller writes exactly length initialized bytes into the allocation.
        let bytes = unsafe { std::slice::from_raw_parts(pointer, length) };
        match std::str::from_utf8(bytes) {
            Ok(source) => render_svg(source),
            Err(_) => Err("TikZ source is not valid UTF-8.".to_owned()),
        }
    };

    let (status, output) = match rendered {
        Ok(svg) if svg.len() <= MAX_OUTPUT_BYTES => (0, svg),
        Ok(_) => (1, "Rendered SVG exceeds the 2 MiB safety limit.".to_owned()),
        Err(message) => (1, message),
    };
    *RESULT.lock().expect("result mutex poisoned") = output.into_bytes();
    status
}

#[unsafe(no_mangle)]
pub extern "C" fn chord_tikz_result_ptr() -> *const u8 {
    RESULT.lock().expect("result mutex poisoned").as_ptr()
}

#[unsafe(no_mangle)]
pub extern "C" fn chord_tikz_result_len() -> usize {
    RESULT.lock().expect("result mutex poisoned").len()
}

#[derive(Clone, Copy)]
struct Point {
    x: f64,
    y: f64,
}

#[derive(Clone, Copy)]
struct Bounds {
    min_x: f64,
    min_y: f64,
    max_x: f64,
    max_y: f64,
}

impl Bounds {
    fn empty() -> Self {
        Self {
            min_x: f64::INFINITY,
            min_y: f64::INFINITY,
            max_x: f64::NEG_INFINITY,
            max_y: f64::NEG_INFINITY,
        }
    }

    fn include(&mut self, point: Point) {
        self.min_x = self.min_x.min(point.x);
        self.min_y = self.min_y.min(point.y);
        self.max_x = self.max_x.max(point.x);
        self.max_y = self.max_y.max(point.y);
    }

    fn include_radius(&mut self, center: Point, radius: f64) {
        self.include(Point {
            x: center.x - radius,
            y: center.y - radius,
        });
        self.include(Point {
            x: center.x + radius,
            y: center.y + radius,
        });
    }

    fn is_empty(self) -> bool {
        !self.min_x.is_finite()
    }
}

#[derive(Default)]
struct Style {
    stroke: String,
    fill: String,
    stroke_width: f64,
    stroke_opacity: f64,
    fill_opacity: f64,
    arrow_start: bool,
    arrow_end: bool,
    dashed: bool,
    round_cap: bool,
    round_join: bool,
    shorten_start: f64,
    shorten_end: f64,
}

struct PictureStyle {
    round_cap: bool,
    round_join: bool,
    node_font_size: f64,
    node_inner_sep: f64,
    coordinate_scale: f64,
    stroke_width: f64,
}

#[derive(Clone, Copy)]
struct NodeGeometry {
    center: Point,
    width: f64,
    height: f64,
}

#[derive(Clone, Copy, Default)]
struct NodeBoxStyle {
    draw: bool,
    rounded: bool,
    minimum_width: f64,
    minimum_height: f64,
}

fn render_svg(source: &str) -> Result<String, String> {
    let cleaned = strip_comments(source);
    let expanded = preprocess(&cleaned)?;
    let picture_style = parse_picture_style(tikz_picture_options(&expanded));
    let node_styles = parse_named_node_styles(tikz_picture_options(&expanded));
    let path_styles = parse_named_path_styles(tikz_picture_options(&expanded));
    let body = tikz_body(&expanded);
    let commands = split_commands(body);
    let mut elements = String::new();
    let mut bounds = Bounds::empty();
    let mut rendered_commands = 0usize;
    let mut uses_arrow = false;
    let mut named_nodes = BTreeMap::new();

    for command in commands {
        let command = command.trim();
        if command.is_empty()
            || command.starts_with("\\begin{tikzpicture}")
            || command.starts_with("\\end{tikzpicture}")
        {
            continue;
        }
        if command.starts_with("\\draw")
            || command.starts_with("\\filldraw")
            || command.starts_with("\\fill")
        {
            let (kind, rest) = if let Some(rest) = command.strip_prefix("\\filldraw") {
                ("filldraw", rest)
            } else if let Some(rest) = command.strip_prefix("\\fill") {
                ("fill", rest)
            } else {
                ("draw", command.strip_prefix("\\draw").unwrap_or(""))
            };
            let (options, path) = take_options(rest.trim())?;
            let style = parse_style(options, kind, &picture_style, &path_styles)?;
            uses_arrow |= style.arrow_start || style.arrow_end;
            render_path(
                path.trim(),
                &style,
                picture_style.coordinate_scale,
                &named_nodes,
                &mut elements,
                &mut bounds,
            )?;
            rendered_commands += 1;
            continue;
        }
        if let Some(rest) = command.strip_prefix("\\node") {
            render_node(
                rest.trim(),
                &picture_style,
                &node_styles,
                &mut named_nodes,
                &mut elements,
                &mut bounds,
            )?;
            rendered_commands += 1;
            continue;
        }
        return Err(format!(
            "This fast WASM core does not support the command yet: {}",
            command.chars().take(80).collect::<String>()
        ));
    }

    if rendered_commands == 0 || bounds.is_empty() {
        return Err("No supported TikZ drawing command was found.".to_owned());
    }
    let padding = 8.0;
    let min_x = bounds.min_x - padding;
    let min_y = bounds.min_y - padding;
    let width = (bounds.max_x - bounds.min_x + 2.0 * padding).max(1.0);
    let height = (bounds.max_y - bounds.min_y + 2.0 * padding).max(1.0);
    let display_width = width * DISPLAY_SCALE;
    let display_height = height * DISPLAY_SCALE;
    let mut svg = String::new();
    write!(
        svg,
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{display_width:.3}\" height=\"{display_height:.3}\" data-chord-display-scale=\"{DISPLAY_SCALE}\" viewBox=\"{min_x:.3} {min_y:.3} {width:.3} {height:.3}\" role=\"img\">"
    )
    .map_err(|_| "Could not create SVG output.".to_owned())?;
    if uses_arrow {
        svg.push_str(
            "<defs><marker id=\"chord-arrow\" viewBox=\"0 -5 10 10\" refX=\"9.4\" refY=\"0\" markerWidth=\"5.8\" markerHeight=\"5.8\" orient=\"auto-start-reverse\"><path d=\"M 10 0 L 0 4.2 L 2.6 0 L 0 -4.2 Z\" fill=\"currentColor\" style=\"fill:context-stroke\" stroke=\"none\"/></marker></defs>",
        );
    }
    svg.push_str("<g data-chord-tikz-content=\"true\">");
    svg.push_str(&elements);
    svg.push_str("</g></svg>");
    Ok(svg)
}

fn render_path(
    path: &str,
    style: &Style,
    coordinate_scale: f64,
    named_nodes: &BTreeMap<String, NodeGeometry>,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    if path.contains("plot[") {
        return render_plot_path(
            path,
            style,
            coordinate_scale,
            output,
            bounds,
        );
    }
    let mut points = parse_path_coordinates(path, named_nodes, coordinate_scale)?
        .into_iter()
        .map(|point| Point {
            x: point.x * coordinate_scale,
            y: point.y * coordinate_scale,
        })
        .collect::<Vec<_>>();
    adjust_implicit_node_endpoints(path, &mut points, named_nodes);
    let first = points
        .first()
        .copied()
        .ok_or_else(|| "A TikZ path needs at least one coordinate.".to_owned())?;
    if let Some(circle_index) = path.find("circle") {
        let radius_text = path[circle_index + "circle".len()..].trim();
        let radius = parse_parenthesized_scalar(radius_text)? * coordinate_scale;
        bounds.include_radius(
            Point {
                x: first.x,
                y: -first.y,
            },
            radius,
        );
        write!(
            output,
            "<circle cx=\"{:.3}\" cy=\"{:.3}\" r=\"{:.3}\" {}/>",
            first.x,
            -first.y,
            radius,
            style_attributes(style)
        )
        .map_err(|_| "Could not create SVG circle.".to_owned())?;
        return Ok(());
    }
    if let Some(ellipse_index) = path.find("ellipse") {
        let options = path[ellipse_index + "ellipse".len()..].trim();
        let (x_radius, y_radius) = parse_ellipse_radii(options, coordinate_scale)?;
        bounds.include(Point {
            x: first.x - x_radius,
            y: -first.y - y_radius,
        });
        bounds.include(Point {
            x: first.x + x_radius,
            y: -first.y + y_radius,
        });
        write!(
            output,
            "<ellipse cx=\"{:.3}\" cy=\"{:.3}\" rx=\"{:.3}\" ry=\"{:.3}\" {}/>",
            first.x,
            -first.y,
            x_radius,
            y_radius,
            style_attributes(style)
        )
        .map_err(|_| "Could not create SVG ellipse.".to_owned())?;
        return Ok(());
    }
    if let Some(arc_index) = path.find("arc[") {
        return render_arc(
            first,
            &path[arc_index + "arc".len()..],
            style,
            coordinate_scale,
            output,
            bounds,
        );
    }
    if path.contains("rectangle") {
        let second = points
            .get(1)
            .copied()
            .ok_or_else(|| "A rectangle needs two coordinates.".to_owned())?;
        bounds.include(Point {
            x: first.x,
            y: -first.y,
        });
        bounds.include(Point {
            x: second.x,
            y: -second.y,
        });
        let x = first.x.min(second.x);
        let y = (-first.y).min(-second.y);
        let width = (second.x - first.x).abs();
        let height = (second.y - first.y).abs();
        write!(
            output,
            "<rect x=\"{x:.3}\" y=\"{y:.3}\" width=\"{width:.3}\" height=\"{height:.3}\" {}/>",
            style_attributes(style)
        )
        .map_err(|_| "Could not create SVG rectangle.".to_owned())?;
        return Ok(());
    }
    if path.contains(".. controls") {
        if points.len() < 4 || (points.len() - 1) % 3 != 0 {
            return Err(
                "A cubic TikZ curve needs one start point and groups of two controls plus one end point.".to_owned(),
            );
        }
        for point in &points {
            bounds.include(Point {
                x: point.x,
                y: -point.y,
            });
        }
        let mut data = format!("M {:.3},{:.3}", points[0].x, -points[0].y);
        for curve in points[1..].chunks_exact(3) {
            write!(
                data,
                " C {:.3},{:.3} {:.3},{:.3} {:.3},{:.3}",
                curve[0].x,
                -curve[0].y,
                curve[1].x,
                -curve[1].y,
                curve[2].x,
                -curve[2].y,
            )
            .map_err(|_| "Could not create SVG cubic curve data.".to_owned())?;
        }
        if path.contains("cycle") {
            data.push_str(" Z");
        }
        write!(
            output,
            "<path d=\"{data}\" {}/>",
            style_attributes(style),
        )
        .map_err(|_| "Could not create SVG cubic curve.".to_owned())?;
        return Ok(());
    }
    if points.len() < 2 {
        return Err("A line path needs at least two coordinates.".to_owned());
    }
    shorten_polyline(&mut points, style.shorten_start, style.shorten_end);
    for point in &points {
        bounds.include(Point {
            x: point.x,
            y: -point.y,
        });
    }
    let point_list = points
        .iter()
        .map(|point| format!("{:.3},{:.3}", point.x, -point.y))
        .collect::<Vec<_>>()
        .join(" ");
    write!(
        output,
        "<polyline points=\"{}\" {}/>",
        point_list,
        style_attributes(style)
    )
    .map_err(|_| "Could not create SVG path.".to_owned())?;
    Ok(())
}

fn render_plot_path(
    path: &str,
    style: &Style,
    coordinate_scale: f64,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    let plot_index = path
        .find("plot[")
        .ok_or_else(|| "A TikZ plot needs options.".to_owned())?;
    let prefix = &path[..plot_index];
    let options_start = plot_index + "plot[".len();
    let options_end = path[options_start..]
        .find(']')
        .map(|relative| options_start + relative)
        .ok_or_else(|| "TikZ plot options are missing ']'.".to_owned())?;
    let options = &path[options_start..options_end];
    let domain = option_value(options, "domain")
        .ok_or_else(|| "A lightweight TikZ plot needs a domain.".to_owned())?;
    let (domain_start, domain_end) = domain
        .split_once(':')
        .ok_or_else(|| "A TikZ plot domain needs start:end.".to_owned())?;
    let domain_start = evaluate_numeric_expression(domain_start.trim())?;
    let domain_end = evaluate_numeric_expression(domain_end.trim())?;
    let samples = option_value(options, "samples")
        .map(|value| value.trim().parse::<usize>())
        .transpose()
        .map_err(|_| "TikZ plot samples must be an integer.".to_owned())?
        .unwrap_or(25)
        .clamp(2, 256);

    let coordinate_source = path[options_end + 1..].trim_start();
    let coordinate_start = coordinate_source
        .find('(')
        .ok_or_else(|| "A TikZ plot needs a coordinate expression.".to_owned())?;
    let coordinate_end = matching_parenthesis(coordinate_source, coordinate_start)?;
    let coordinate = &coordinate_source[coordinate_start + 1..coordinate_end];
    let (x_expression, y_expression) = split_coordinate_values(coordinate)?;

    let mut points = parse_coordinates(prefix)?
        .into_iter()
        .map(|point| Point {
            x: point.x * coordinate_scale,
            y: point.y * coordinate_scale,
        })
        .collect::<Vec<_>>();
    for index in 0..samples {
        let fraction = index as f64 / (samples - 1) as f64;
        let variable = domain_start + (domain_end - domain_start) * fraction;
        let variable = format!("{variable:.12}");
        let x =
            evaluate_plot_expression(x_expression, &variable)? * UNIT * coordinate_scale;
        let y =
            evaluate_plot_expression(y_expression, &variable)? * UNIT * coordinate_scale;
        points.push(Point { x, y });
    }
    if points.is_empty() {
        return Err("A TikZ plot did not produce any coordinates.".to_owned());
    }

    let closed = coordinate_source[coordinate_end + 1..].contains("cycle");
    let mut data = String::new();
    for (index, point) in points.iter().enumerate() {
        bounds.include(Point {
            x: point.x,
            y: -point.y,
        });
        if index == 0 {
            write!(data, "M {:.3},{:.3}", point.x, -point.y)
        } else {
            write!(data, " L {:.3},{:.3}", point.x, -point.y)
        }
        .map_err(|_| "Could not create SVG plot data.".to_owned())?;
    }
    if closed {
        data.push_str(" Z");
    }
    write!(
        output,
        "<path d=\"{}\" {}/>",
        data,
        style_attributes(style)
    )
    .map_err(|_| "Could not create SVG plot.".to_owned())?;
    Ok(())
}

fn evaluate_plot_expression(source: &str, variable: &str) -> Result<f64, String> {
    let expression = source
        .trim()
        .strip_prefix('{')
        .and_then(|value| value.strip_suffix('}'))
        .unwrap_or(source.trim())
        .replace("\\x", variable);
    evaluate_numeric_expression(&expression)
}

fn render_node(
    rest: &str,
    picture_style: &PictureStyle,
    named_styles: &BTreeMap<String, NodeBoxStyle>,
    named_nodes: &mut BTreeMap<String, NodeGeometry>,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    let (options, rest) = take_options(rest)?;
    let rest = rest.trim();
    let (node_name, rest) = if rest.starts_with('(') {
        let end = rest
            .find(')')
            .ok_or_else(|| "A named node is missing ')'.".to_owned())?;
        let name = rest[1..end].trim();
        if name.is_empty() {
            return Err("A named node needs a name.".to_owned());
        }
        (Some(name), rest[end + 1..].trim())
    } else {
        (None, rest)
    };
    let (mut point, rest) = if let Some(after_at) = rest.strip_prefix("at") {
        let (point, end) = parse_coordinate_at(after_at.trim(), 0)?;
        (point, &after_at.trim()[end..])
    } else {
        (Point { x: 0.0, y: 0.0 }, rest)
    };
    point.x *= picture_style.coordinate_scale;
    point.y *= picture_style.coordinate_scale;
    let text_start = rest
        .find('{')
        .ok_or_else(|| "A node needs braced text.".to_owned())?;
    let (text, _) = take_braced(&rest[text_start..])?;
    let trimmed_text = text.trim();
    let math_source = trimmed_text
        .strip_prefix('$')
        .and_then(|value| value.strip_suffix('$'));
    let is_math = math_source.is_some();
    let text = latex_text_to_unicode(text);
    let text_lines = text.split('\n').collect::<Vec<_>>();
    let font_size = node_font_size(options, picture_style.node_font_size);
    let estimated_width = (text_lines
        .iter()
        .map(|line| visible_character_count(line))
        .max()
        .unwrap_or(1) as f64
        * font_size
        * 0.58)
        .max(font_size * 0.6);
    let half_height = font_size * 0.62 * text_lines.len().max(1) as f64;
    let node_padding = parse_node_padding(
        options,
        picture_style.node_inner_sep,
    );
    let box_style = resolved_node_box_style(options, named_styles);
    let width = (estimated_width + 2.0 * node_padding)
        .max(box_style.minimum_width * picture_style.coordinate_scale);
    let height = (2.0 * (half_height + node_padding))
        .max(box_style.minimum_height * picture_style.coordinate_scale);
    apply_node_position(
        options,
        &mut point,
        width / 2.0,
        height / 2.0,
    );
    let placement = node_placement(options);
    let anchor_point = placement.map(|placement| {
        node_anchor_point(
            point,
            placement,
            width / 2.0,
            height / 2.0,
        )
    });
    bounds.include(Point {
        x: point.x - width / 2.0,
        y: -point.y - height / 2.0,
    });
    bounds.include(Point {
        x: point.x + width / 2.0,
        y: -point.y + height / 2.0,
    });
    if box_style.draw {
        write!(
            output,
            "<rect x=\"{:.3}\" y=\"{:.3}\" width=\"{width:.3}\" height=\"{height:.3}\"{} fill=\"var(--background-primary)\" stroke=\"currentColor\" stroke-width=\"{:.3}\"/>",
            point.x - width / 2.0,
            -point.y - height / 2.0,
            if box_style.rounded { " rx=\"4\" ry=\"4\"" } else { "" },
            0.4 * TEX_POINT,
        )
        .map_err(|_| "Could not create SVG node box.".to_owned())?;
    } else if node_has_background(options) {
        write!(
            output,
            "<rect data-chord-node-background=\"true\" x=\"{:.3}\" y=\"{:.3}\" width=\"{width:.3}\" height=\"{height:.3}\" fill=\"var(--background-primary)\" stroke=\"none\"/>",
            point.x - width / 2.0,
            -point.y - height / 2.0,
        )
        .map_err(|_| "Could not create SVG node background.".to_owned())?;
    }
    let label_attribute = if let Some(source) = math_source {
        format!(" data-chord-math=\"{}\"", escape_xml(source))
    } else {
        format!(" data-chord-text=\"{}\"", escape_xml(trimmed_text))
    };
    let placement_attribute = placement
        .zip(anchor_point)
        .map(|(placement, anchor)| {
            format!(
                " data-chord-placement=\"{placement}\" data-chord-anchor-x=\"{:.3}\" data-chord-anchor-y=\"{:.3}\" data-chord-gap=\"{node_padding:.3}\"",
                anchor.x,
                -anchor.y,
            )
        })
        .unwrap_or_default();
    let background_attribute = if node_has_background(options) {
        format!(
            " data-chord-background=\"true\" data-chord-padding=\"{node_padding:.3}\""
        )
    } else {
        String::new()
    };
    let label_anchor = format!(
        "{label_attribute} data-chord-x=\"{:.3}\" data-chord-y=\"{:.3}\" data-chord-font-size=\"{font_size:.3}\" data-chord-width=\"{width:.3}\"{}{placement_attribute}{background_attribute}",
        point.x,
        -point.y,
        if options.contains("\\bfseries")
        {
            " data-chord-font-weight=\"700\""
        } else {
            ""
        },
    );
    write!(
        output,
        "<text x=\"{:.3}\" y=\"{:.3}\" text-anchor=\"middle\" dominant-baseline=\"middle\" fill=\"currentColor\" font-family=\"STIX Two Math, Cambria Math, Times New Roman, serif\" font-size=\"{:.3}\"{}{}>",
        point.x,
        -point.y,
        font_size,
        if is_math { " font-style=\"italic\"" } else { "" },
        label_anchor,
    )
    .map_err(|_| "Could not create SVG text.".to_owned())?;
    if text_lines.len() == 1 {
        output.push_str(&escape_xml(text_lines[0]));
    } else {
        for (index, line) in text_lines.iter().enumerate() {
            write!(
                output,
                "<tspan x=\"{:.3}\" dy=\"{}em\">{}</tspan>",
                point.x,
                if index == 0 {
                    -0.6 * (text_lines.len() - 1) as f64
                } else {
                    1.2
                },
                escape_xml(line),
            )
            .map_err(|_| "Could not create multiline SVG text.".to_owned())?;
        }
    }
    output.push_str("</text>");
    if let Some(name) = node_name {
        named_nodes.insert(
            name.to_owned(),
            NodeGeometry {
                center: point,
                width,
                height,
            },
        );
    }
    Ok(())
}

fn apply_node_position(
    options: &str,
    point: &mut Point,
    half_width: f64,
    half_height: f64,
) {
    let mut x_shift = 0.0;
    let mut y_shift = 0.0;
    for option in options.split(',').map(str::trim) {
        match option {
            "above" => point.y += half_height,
            "below" => point.y -= half_height,
            "left" => point.x -= half_width,
            "right" => point.x += half_width,
            "above left" | "left above" => {
                point.x -= half_width;
                point.y += half_height;
            }
            "above right" | "right above" => {
                point.x += half_width;
                point.y += half_height;
            }
            "below left" | "left below" => {
                point.x -= half_width;
                point.y -= half_height;
            }
            "below right" | "right below" => {
                point.x += half_width;
                point.y -= half_height;
            }
            value if value.starts_with("xshift=") => {
                if let Ok(shift) = parse_length(&value["xshift=".len()..]) {
                    x_shift += shift;
                }
            }
            value if value.starts_with("yshift=") => {
                if let Ok(shift) = parse_length(&value["yshift=".len()..]) {
                    y_shift += shift;
                }
            }
            _ => {}
        }
    }
    point.x += x_shift;
    point.y += y_shift;
}

fn node_placement(options: &str) -> Option<&'static str> {
    options.split(',').map(str::trim).find_map(|option| match option {
        "above" => Some("above"),
        "below" => Some("below"),
        "left" => Some("left"),
        "right" => Some("right"),
        "above left" | "left above" => Some("above-left"),
        "above right" | "right above" => Some("above-right"),
        "below left" | "left below" => Some("below-left"),
        "below right" | "right below" => Some("below-right"),
        _ => None,
    })
}

fn node_anchor_point(
    positioned: Point,
    placement: &str,
    half_width: f64,
    half_height: f64,
) -> Point {
    let mut anchor = positioned;
    if placement.contains("left") {
        anchor.x += half_width;
    } else if placement.contains("right") {
        anchor.x -= half_width;
    }
    if placement.contains("above") {
        anchor.y -= half_height;
    } else if placement.contains("below") {
        anchor.y += half_height;
    }
    anchor
}

fn parse_coordinates(input: &str) -> Result<Vec<Point>, String> {
    let mut points = Vec::new();
    let mut cursor = 0usize;
    while let Some(relative) = input[cursor..].find('(') {
        let start = cursor + relative;
        let end = matching_parenthesis(input, start)?;
        let inside = &input[start + 1..end];
        if inside.contains(',') {
            points.push(parse_coordinate(inside)?);
        }
        cursor = end + 1;
    }
    Ok(points)
}

fn parse_path_coordinates(
    input: &str,
    named_nodes: &BTreeMap<String, NodeGeometry>,
    coordinate_scale: f64,
) -> Result<Vec<Point>, String> {
    let mut points = Vec::new();
    for coordinate in coordinate_tokens(input)? {
        if coordinate.contains(',') {
            points.push(parse_coordinate(coordinate)?);
        } else if coordinate.contains("|-") {
            let (vertical, horizontal) = coordinate
                .split_once("|-")
                .ok_or_else(|| "Invalid TikZ orthogonal coordinate.".to_owned())?;
            let vertical =
                resolve_node_reference(vertical.trim(), named_nodes, coordinate_scale)?;
            let horizontal =
                resolve_node_reference(horizontal.trim(), named_nodes, coordinate_scale)?;
            points.push(Point {
                x: vertical.x,
                y: horizontal.y,
            });
        } else if let Ok(point) =
            resolve_node_reference(coordinate.trim(), named_nodes, coordinate_scale)
        {
            points.push(point);
        }
    }
    Ok(points)
}

fn coordinate_tokens(input: &str) -> Result<Vec<&str>, String> {
    let mut tokens = Vec::new();
    let mut cursor = 0usize;
    while let Some(relative) = input[cursor..].find('(') {
        let start = cursor + relative;
        let end = matching_parenthesis(input, start)?;
        tokens.push(&input[start + 1..end]);
        cursor = end + 1;
    }
    Ok(tokens)
}

fn resolve_node_reference(
    reference: &str,
    named_nodes: &BTreeMap<String, NodeGeometry>,
    coordinate_scale: f64,
) -> Result<Point, String> {
    let (name, anchor) = reference
        .split_once('.')
        .map_or((reference, ""), |(name, anchor)| (name, anchor));
    let node = named_nodes
        .get(name.trim())
        .ok_or_else(|| format!("Unknown TikZ node: {}", name.trim()))?;
    let mut point = node.center;
    match anchor.trim() {
        "" | "center" => {}
        "north" => point.y += node.height / 2.0,
        "south" => point.y -= node.height / 2.0,
        "east" => point.x += node.width / 2.0,
        "west" => point.x -= node.width / 2.0,
        value => return Err(format!("Unsupported TikZ node anchor: {value}")),
    }
    Ok(Point {
        x: point.x / coordinate_scale,
        y: point.y / coordinate_scale,
    })
}

fn adjust_implicit_node_endpoints(
    path: &str,
    points: &mut [Point],
    named_nodes: &BTreeMap<String, NodeGeometry>,
) {
    if points.len() < 2 {
        return;
    }
    let Ok(tokens) = coordinate_tokens(path) else {
        return;
    };
    let Some(first) = tokens.first().and_then(|token| plain_node(token, named_nodes)) else {
        return adjust_last_implicit_endpoint(&tokens, points, named_nodes);
    };
    points[0] = node_border_point(*first, points[1]);
    adjust_last_implicit_endpoint(&tokens, points, named_nodes);
}

fn adjust_last_implicit_endpoint(
    tokens: &[&str],
    points: &mut [Point],
    named_nodes: &BTreeMap<String, NodeGeometry>,
) {
    let Some(last) = tokens.last().and_then(|token| plain_node(token, named_nodes)) else {
        return;
    };
    let last_index = points.len() - 1;
    points[last_index] = node_border_point(*last, points[last_index - 1]);
}

fn plain_node<'a>(
    token: &str,
    named_nodes: &'a BTreeMap<String, NodeGeometry>,
) -> Option<&'a NodeGeometry> {
    let token = token.trim();
    if token.chars().any(|character| matches!(character, '.' | ',' | '|')) {
        return None;
    }
    named_nodes.get(token)
}

fn node_border_point(node: NodeGeometry, toward: Point) -> Point {
    let delta_x = toward.x - node.center.x;
    let delta_y = toward.y - node.center.y;
    if delta_x.abs() < f64::EPSILON && delta_y.abs() < f64::EPSILON {
        return node.center;
    }
    let horizontal = if delta_x.abs() < f64::EPSILON {
        f64::INFINITY
    } else {
        (node.width / 2.0) / delta_x.abs()
    };
    let vertical = if delta_y.abs() < f64::EPSILON {
        f64::INFINITY
    } else {
        (node.height / 2.0) / delta_y.abs()
    };
    let factor = horizontal.min(vertical);
    Point {
        x: node.center.x + delta_x * factor,
        y: node.center.y + delta_y * factor,
    }
}

fn parse_coordinate_at(input: &str, start: usize) -> Result<(Point, usize), String> {
    if input.as_bytes().get(start) != Some(&b'(') {
        return Err("Expected a TikZ coordinate.".to_owned());
    }
    let close = matching_parenthesis(input, start)?;
    Ok((parse_coordinate(&input[start + 1..close])?, close + 1))
}

fn parse_coordinate(input: &str) -> Result<Point, String> {
    let (x, y) = split_coordinate_values(input)?;
    Ok(Point {
        x: parse_length(x)?,
        y: parse_length(y)?,
    })
}

fn parse_parenthesized_scalar(input: &str) -> Result<f64, String> {
    let start = input
        .find('(')
        .ok_or_else(|| "Expected a parenthesized TikZ length.".to_owned())?;
    let end = input[start + 1..]
        .find(')')
        .ok_or_else(|| "A TikZ length is missing ')'.".to_owned())?
        + start
        + 1;
    parse_length(&input[start + 1..end])
}

fn parse_ellipse_radii(
    input: &str,
    coordinate_scale: f64,
) -> Result<(f64, f64), String> {
    if input.starts_with('[') {
        let (options, _) = take_options(input)?;
        let x_radius = option_value(options, "x radius")
            .ok_or_else(|| "An ellipse needs an x radius.".to_owned())
            .and_then(parse_length)?;
        let y_radius = option_value(options, "y radius")
            .ok_or_else(|| "An ellipse needs a y radius.".to_owned())
            .and_then(parse_length)?;
        return Ok((
            x_radius * coordinate_scale,
            y_radius * coordinate_scale,
        ));
    }
    let start = input
        .find('(')
        .ok_or_else(|| "An ellipse needs parenthesized radii.".to_owned())?;
    let end = matching_parenthesis(input, start)?;
    let radii = &input[start + 1..end];
    let (x_radius, y_radius) = radii
        .split_once(" and ")
        .ok_or_else(|| "An ellipse needs radii in the form '(x and y)'.".to_owned())?;
    Ok((
        parse_length(x_radius)? * coordinate_scale,
        parse_length(y_radius)? * coordinate_scale,
    ))
}

fn parse_length(raw: &str) -> Result<f64, String> {
    let value = raw
        .trim()
        .strip_prefix('{')
        .and_then(|value| value.strip_suffix('}'))
        .unwrap_or(raw.trim())
        .trim();
    let units = [("cm", UNIT), ("mm", UNIT / 10.0), ("pt", 96.0 / 72.27), ("in", 96.0)];
    for (suffix, scale) in units {
        if let Some(number) = value.strip_suffix(suffix) {
            return number
                .trim()
                .parse::<f64>()
                .map(|number| number * scale)
                .map_err(|_| format!("Invalid TikZ length: {value}"));
        }
    }
    value
        .parse::<f64>()
        .or_else(|_| evaluate_numeric_expression(value))
        .map(|number| number * UNIT)
        .map_err(|_| format!("Invalid TikZ number or expression: {value}"))
}

fn render_arc(
    start: Point,
    input: &str,
    style: &Style,
    coordinate_scale: f64,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    let (options, _) = take_options(input)?;
    let start_angle = option_value(options, "start angle")
        .ok_or_else(|| "A TikZ arc needs a start angle.".to_owned())
        .and_then(evaluate_numeric_expression)?;
    let end_angle = option_value(options, "end angle")
        .ok_or_else(|| "A TikZ arc needs an end angle.".to_owned())
        .and_then(evaluate_numeric_expression)?;
    let radius = option_value(options, "radius")
        .ok_or_else(|| "A TikZ arc needs a radius.".to_owned())
        .and_then(parse_length)?
        * coordinate_scale;
    if radius <= 0.0 || !radius.is_finite() {
        return Err("A TikZ arc needs a positive finite radius.".to_owned());
    }
    let start_radians = start_angle.to_radians();
    let center = Point {
        x: start.x - radius * start_radians.cos(),
        y: start.y - radius * start_radians.sin(),
    };
    let end_radians = end_angle.to_radians();
    let end = Point {
        x: center.x + radius * end_radians.cos(),
        y: center.y + radius * end_radians.sin(),
    };
    let delta = normalized_arc_delta(start_angle, end_angle);
    let large_arc = usize::from(delta.abs() > 180.0);
    let sweep = usize::from(delta < 0.0);

    include_arc_bounds(bounds, center, radius, start_angle, delta, start, end);
    write!(
        output,
        "<path d=\"M {:.3},{:.3} A {radius:.3},{radius:.3} 0 {large_arc} {sweep} {:.3},{:.3}\" {}/>",
        start.x,
        -start.y,
        end.x,
        -end.y,
        style_attributes(style),
    )
    .map_err(|_| "Could not create SVG arc.".to_owned())
}

fn normalized_arc_delta(start_angle: f64, end_angle: f64) -> f64 {
    let raw = end_angle - start_angle;
    if raw == 0.0 {
        return 0.0;
    }
    let mut delta = raw % 360.0;
    if delta == 0.0 {
        delta = 360.0 * raw.signum();
    }
    delta
}

fn include_arc_bounds(
    bounds: &mut Bounds,
    center: Point,
    radius: f64,
    start_angle: f64,
    delta: f64,
    start: Point,
    end: Point,
) {
    bounds.include(Point {
        x: start.x,
        y: -start.y,
    });
    bounds.include(Point {
        x: end.x,
        y: -end.y,
    });
    for angle in [0.0, 90.0, 180.0, 270.0] {
        if angle_is_on_arc(angle, start_angle, delta) {
            let radians = angle.to_radians();
            bounds.include(Point {
                x: center.x + radius * radians.cos(),
                y: -(center.y + radius * radians.sin()),
            });
        }
    }
}

fn angle_is_on_arc(angle: f64, start_angle: f64, delta: f64) -> bool {
    if delta >= 0.0 {
        (angle - start_angle).rem_euclid(360.0) <= delta + 1e-9
    } else {
        (start_angle - angle).rem_euclid(360.0) <= -delta + 1e-9
    }
}

fn shorten_polyline(points: &mut [Point], shorten_start: f64, shorten_end: f64) {
    if points.len() < 2 {
        return;
    }
    if shorten_start > 0.0 {
        let shortened = point_towards(points[0], points[1], shorten_start);
        points[0] = shortened;
    }
    if shorten_end > 0.0 {
        let last = points.len() - 1;
        let shortened = point_towards(points[last], points[last - 1], shorten_end);
        points[last] = shortened;
    }
}

fn point_towards(from: Point, to: Point, distance: f64) -> Point {
    let dx = to.x - from.x;
    let dy = to.y - from.y;
    let length = dx.hypot(dy);
    if length <= f64::EPSILON {
        return from;
    }
    let fraction = (distance / length).clamp(0.0, 1.0);
    Point {
        x: from.x + dx * fraction,
        y: from.y + dy * fraction,
    }
}

fn matching_parenthesis(input: &str, start: usize) -> Result<usize, String> {
    if input.as_bytes().get(start) != Some(&b'(') {
        return Err("Expected a TikZ coordinate.".to_owned());
    }
    let mut depth = 0usize;
    for (relative, character) in input[start..].char_indices() {
        match character {
            '(' => depth += 1,
            ')' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Ok(start + relative);
                }
            }
            _ => {}
        }
    }
    Err("A TikZ coordinate is missing ')'.".to_owned())
}

fn split_coordinate_values(input: &str) -> Result<(&str, &str), String> {
    let mut brace_depth = 0usize;
    let mut parenthesis_depth = 0usize;
    for (index, character) in input.char_indices() {
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            '(' => parenthesis_depth += 1,
            ')' => parenthesis_depth = parenthesis_depth.saturating_sub(1),
            ',' if brace_depth == 0 && parenthesis_depth == 0 => {
                return Ok((&input[..index], &input[index + 1..]));
            }
            _ => {}
        }
    }
    Err("A TikZ coordinate needs x and y values.".to_owned())
}

fn option_value<'a>(options: &'a str, name: &str) -> Option<&'a str> {
    options.split(',').find_map(|option| {
        let (key, value) = option.split_once('=')?;
        (key.trim() == name).then_some(value.trim())
    })
}

fn parse_style(
    options: &str,
    kind: &str,
    picture_style: &PictureStyle,
    named_styles: &BTreeMap<String, String>,
) -> Result<Style, String> {
    let mut style = Style {
        stroke: if kind == "fill" { "none" } else { "currentColor" }.to_owned(),
        fill: if kind == "draw" { "none" } else { "currentColor" }.to_owned(),
        stroke_width: picture_style.stroke_width,
        stroke_opacity: 1.0,
        fill_opacity: 1.0,
        arrow_start: false,
        arrow_end: false,
        dashed: false,
        round_cap: picture_style.round_cap,
        round_join: picture_style.round_join,
        shorten_start: 0.0,
        shorten_end: 0.0,
    };
    apply_path_style_options(&mut style, options, kind, named_styles, 0)?;
    Ok(style)
}

fn apply_path_style_options(
    style: &mut Style,
    options: &str,
    kind: &str,
    named_styles: &BTreeMap<String, String>,
    depth: usize,
) -> Result<(), String> {
    if depth > 8 {
        return Err("TikZ path-style expansion exceeded the safety depth.".to_owned());
    }
    for raw in split_top_level_commas(options) {
        let option = raw.trim();
        if let Some(definition) = named_styles.get(option) {
            apply_path_style_options(style, definition, kind, named_styles, depth + 1)?;
        } else if option == "->" {
            style.arrow_end = true;
        } else if option == "<-" {
            style.arrow_start = true;
        } else if option == "<->" {
            style.arrow_start = true;
            style.arrow_end = true;
        } else if option == "thin" {
            style.stroke_width = 0.4 * TEX_POINT;
        } else if option == "thick" {
            style.stroke_width = 0.8 * TEX_POINT;
        } else if option == "very thick" {
            style.stroke_width = 1.2 * TEX_POINT;
        } else if option == "dashed" {
            style.dashed = true;
        } else if let Some(value) = option.strip_prefix("shorten >=") {
            style.shorten_end = parse_length(value)?.max(0.0);
        } else if let Some(value) = option.strip_prefix("shorten <=") {
            style.shorten_start = parse_length(value)?.max(0.0);
        } else if let Some(color) = option.strip_prefix("draw=") {
            let (color, opacity) = svg_color_with_opacity(color);
            style.stroke = color;
            style.stroke_opacity = opacity;
        } else if let Some(color) = option.strip_prefix("fill=") {
            let (color, opacity) = svg_color_with_opacity(color);
            style.fill = color;
            style.fill_opacity = opacity;
        } else if is_named_color(option) || is_xcolor_mix(option) {
            let (color, opacity) = svg_color_with_opacity(option);
            if kind != "fill" {
                style.stroke = color.clone();
                style.stroke_opacity = opacity;
            }
            if kind != "draw" {
                style.fill = color;
                style.fill_opacity = opacity;
            }
        } else if !option.is_empty() {
            return Err(format!(
                "This fast WASM core does not support the path option yet: {option}"
            ));
        }
    }
    Ok(())
}

fn style_attributes(style: &Style) -> String {
    format!(
        "fill=\"{}\" stroke=\"{}\" stroke-width=\"{:.3}\" fill-opacity=\"{:.3}\" stroke-opacity=\"{:.3}\"{}{}{}{}{}",
        escape_xml(&style.fill),
        escape_xml(&style.stroke),
        style.stroke_width,
        style.fill_opacity,
        style.stroke_opacity,
        if style.arrow_start {
            " marker-start=\"url(#chord-arrow)\""
        } else {
            ""
        },
        if style.arrow_end {
            " marker-end=\"url(#chord-arrow)\""
        } else {
            ""
        },
        if style.dashed {
            " stroke-dasharray=\"5 4\""
        } else {
            ""
        },
        if style.round_cap {
            " stroke-linecap=\"round\""
        } else {
            ""
        },
        if style.round_join {
            " stroke-linejoin=\"round\""
        } else {
            ""
        },
    )
}

fn svg_color(raw: &str) -> String {
    match raw.trim() {
        "black" => "currentColor".to_owned(),
        "white" => "var(--background-primary)".to_owned(),
        value if is_named_color(value) => value.to_owned(),
        _ => "currentColor".to_owned(),
    }
}

fn svg_color_with_opacity(raw: &str) -> (String, f64) {
    let value = raw.trim();
    let Some((base, percentage)) = value.split_once('!') else {
        return (svg_color(value), 1.0);
    };
    let opacity = percentage
        .split('!')
        .next()
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|value| value.is_finite())
        .map(|value| (value / 100.0).clamp(0.0, 1.0))
        .unwrap_or(1.0);
    (svg_color(base), opacity)
}

fn is_xcolor_mix(value: &str) -> bool {
    value
        .split_once('!')
        .is_some_and(|(base, percentage)| {
            is_named_color(base.trim())
                && percentage
                    .split('!')
                    .next()
                    .is_some_and(|value| value.trim().parse::<f64>().is_ok())
        })
}

fn is_named_color(value: &str) -> bool {
    matches!(
        value,
        "black" | "white" | "red" | "green" | "blue" | "cyan" | "magenta" | "yellow" | "gray"
    )
}

fn parse_picture_style(options: &str) -> PictureStyle {
    let coordinate_scale = options
        .split(',')
        .find_map(|raw| raw.trim().strip_prefix("scale="))
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0 && *value <= 10.0)
        .unwrap_or(1.0);
    let node_font_size = tikz_node_font_size(options);
    PictureStyle {
        round_cap: options.contains("line cap=round"),
        round_join: options.contains("line join=round"),
        node_font_size,
        node_inner_sep: node_font_size / 3.0,
        coordinate_scale,
        stroke_width: if split_top_level_commas(options)
            .iter()
            .any(|option| option.trim() == "thick")
        {
            0.8 * TEX_POINT
        } else {
            0.4 * TEX_POINT
        },
    }
}

fn tikz_node_font_size(options: &str) -> f64 {
    if !options.contains("every node/.style") {
        return 10.0 * TEX_POINT;
    }
    node_font_size(options, 10.0 * TEX_POINT)
}

fn node_font_size(options: &str, fallback: f64) -> f64 {
    if options.contains("\\tiny") {
        5.0 * TEX_POINT
    } else if options.contains("\\scriptsize") {
        7.0 * TEX_POINT
    } else if options.contains("\\small") {
        9.0 * TEX_POINT
    } else if options.contains("\\normalsize") {
        10.0 * TEX_POINT
    } else if options.contains("\\Large") {
        14.4 * TEX_POINT
    } else if options.contains("\\large") {
        12.0 * TEX_POINT
    } else {
        fallback
    }
}

fn parse_named_node_styles(options: &str) -> BTreeMap<String, NodeBoxStyle> {
    let mut styles = BTreeMap::new();
    for option in split_top_level_commas(options) {
        let Some((name, definition)) = option.split_once("/.style=") else {
            continue;
        };
        let definition = definition
            .trim()
            .strip_prefix('{')
            .and_then(|value| value.strip_suffix('}'))
            .unwrap_or(definition.trim());
        let style = parse_node_box_style(definition, &BTreeMap::new());
        styles.insert(name.trim().to_owned(), style);
    }
    styles
}

fn parse_named_path_styles(options: &str) -> BTreeMap<String, String> {
    let mut styles = BTreeMap::new();
    for option in split_top_level_commas(options) {
        let Some((name, definition)) = option.split_once("/.style=") else {
            continue;
        };
        let definition = definition
            .trim()
            .strip_prefix('{')
            .and_then(|value| value.strip_suffix('}'))
            .unwrap_or(definition.trim());
        styles.insert(name.trim().to_owned(), definition.to_owned());
    }
    styles
}

fn resolved_node_box_style(
    options: &str,
    named_styles: &BTreeMap<String, NodeBoxStyle>,
) -> NodeBoxStyle {
    parse_node_box_style(options, named_styles)
}

fn parse_node_box_style(
    options: &str,
    named_styles: &BTreeMap<String, NodeBoxStyle>,
) -> NodeBoxStyle {
    let mut style = NodeBoxStyle::default();
    for raw in split_top_level_commas(options) {
        let option = raw.trim();
        if let Some(named) = named_styles.get(option) {
            style = *named;
        } else if option == "draw" {
            style.draw = true;
        } else if option == "rounded corners" {
            style.rounded = true;
        } else if let Some(value) = option.strip_prefix("minimum width=") {
            if let Ok(width) = parse_length(value) {
                style.minimum_width = width.max(0.0);
            }
        } else if let Some(value) = option.strip_prefix("minimum height=") {
            if let Ok(height) = parse_length(value) {
                style.minimum_height = height.max(0.0);
            }
        }
    }
    style
}

fn split_top_level_commas(source: &str) -> Vec<&str> {
    let mut values = Vec::new();
    let mut start = 0usize;
    let mut brace_depth = 0usize;
    let mut bracket_depth = 0usize;
    let mut parenthesis_depth = 0usize;
    for (index, character) in source.char_indices() {
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            '[' => bracket_depth += 1,
            ']' => bracket_depth = bracket_depth.saturating_sub(1),
            '(' => parenthesis_depth += 1,
            ')' => parenthesis_depth = parenthesis_depth.saturating_sub(1),
            ',' if brace_depth == 0 && bracket_depth == 0 && parenthesis_depth == 0 => {
                values.push(&source[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    values.push(&source[start..]);
    values
}

fn parse_node_padding(options: &str, default_padding: f64) -> f64 {
    for raw in options.split(',') {
        if let Some(value) = raw.trim().strip_prefix("inner sep=") {
            if let Ok(padding) = parse_length(value) {
                return padding;
            }
        }
    }
    default_padding
}

fn node_has_background(options: &str) -> bool {
    options
        .split(',')
        .any(|raw| raw.trim().starts_with("fill="))
}

fn visible_character_count(text: &str) -> usize {
    text.chars()
        .filter(|character| !matches!(*character, '\u{20d7}' | '_' | '^'))
        .count()
}

fn take_options(input: &str) -> Result<(&str, &str), String> {
    let input = input.trim();
    if !input.starts_with('[') {
        return Ok(("", input));
    }
    let end = input
        .find(']')
        .ok_or_else(|| "TikZ options are missing ']'.".to_owned())?;
    Ok((&input[1..end], input[end + 1..].trim()))
}

fn take_braced(input: &str) -> Result<(&str, usize), String> {
    if !input.starts_with('{') {
        return Err("Expected braced TikZ text.".to_owned());
    }
    let mut depth = 0usize;
    for (index, character) in input.char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth -= 1;
                if depth == 0 {
                    return Ok((&input[1..index], index + 1));
                }
            }
            _ => {}
        }
    }
    Err("TikZ text is missing '}'.".to_owned())
}

fn tikz_body(source: &str) -> &str {
    if let Some(start) = source.find("\\begin{tikzpicture}") {
        let content_start = start + "\\begin{tikzpicture}".len();
        if let Some(relative_end) = source[content_start..].find("\\end{tikzpicture}") {
            return strip_picture_options(
                &source[content_start..content_start + relative_end],
            );
        }
    }
    source
}

fn tikz_picture_options(source: &str) -> &str {
    let Some(start) = source.find("\\begin{tikzpicture}") else {
        return "";
    };
    let rest = source[start + "\\begin{tikzpicture}".len()..].trim_start();
    if !rest.starts_with('[') {
        return "";
    }

    let mut bracket_depth = 0usize;
    let mut brace_depth = 0usize;
    for (index, character) in rest.char_indices() {
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            '[' if brace_depth == 0 => bracket_depth += 1,
            ']' if brace_depth == 0 => {
                bracket_depth = bracket_depth.saturating_sub(1);
                if bracket_depth == 0 {
                    return &rest[1..index];
                }
            }
            _ => {}
        }
    }
    ""
}

fn strip_picture_options(body: &str) -> &str {
    let body = body.trim_start();
    if !body.starts_with('[') {
        return body;
    }

    let mut bracket_depth = 0usize;
    let mut brace_depth = 0usize;
    for (index, character) in body.char_indices() {
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            '[' if brace_depth == 0 => bracket_depth += 1,
            ']' if brace_depth == 0 => {
                bracket_depth = bracket_depth.saturating_sub(1);
                if bracket_depth == 0 {
                    return body[index + 1..].trim_start();
                }
            }
            _ => {}
        }
    }
    body
}

fn split_commands(source: &str) -> Vec<&str> {
    let mut commands = Vec::new();
    let mut start = 0usize;
    let mut brace_depth = 0usize;
    for (index, character) in source.char_indices() {
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            ';' if brace_depth == 0 => {
                commands.push(&source[start..index]);
                start = index + 1;
            }
            _ => {}
        }
    }
    if source[start..].trim().len() > 0 {
        commands.push(&source[start..]);
    }
    commands
}

fn strip_comments(source: &str) -> String {
    source
        .lines()
        .map(|line| line.split('%').next().unwrap_or(""))
        .collect::<Vec<_>>()
        .join("\n")
}

fn latex_text_to_unicode(input: &str) -> String {
    let trimmed = input.trim();
    let math = trimmed
        .strip_prefix('$')
        .and_then(|value| value.strip_suffix('$'))
        .unwrap_or(trimmed);
    let characters = math.chars().collect::<Vec<_>>();
    let mut output = String::new();
    let mut index = 0usize;

    while index < characters.len() {
        if characters[index] != '\\' {
            if !matches!(characters[index], '$' | '{' | '}') {
                output.push(characters[index]);
            }
            index += 1;
            continue;
        }

        if characters.get(index + 1) == Some(&'\\') {
            output.push('\n');
            index += 2;
            continue;
        }

        index += 1;
        let command_start = index;
        while index < characters.len() && characters[index].is_ascii_alphabetic() {
            index += 1;
        }
        let command = characters[command_start..index].iter().collect::<String>();
        if matches!(
            command.as_str(),
            "vec"
                | "boldsymbol"
                | "mathbf"
                | "mathrm"
                | "mathit"
                | "mathsf"
                | "mathtt"
                | "operatorname"
        ) {
            while index < characters.len() && characters[index].is_whitespace() {
                index += 1;
            }
            if index < characters.len() && characters[index] == '{' {
                index += 1;
                let value_start = index;
                let mut depth = 1usize;
                while index < characters.len() && depth > 0 {
                    match characters[index] {
                        '{' => depth += 1,
                        '}' => {
                            depth -= 1;
                            if depth == 0 {
                                break;
                            }
                        }
                        _ => {}
                    }
                    index += 1;
                }
                output.push_str(&latex_text_to_unicode(
                    &characters[value_start..index].iter().collect::<String>(),
                ));
                if index < characters.len() {
                    index += 1;
                }
            } else if index < characters.len() {
                output.push(characters[index]);
                index += 1;
            }
            if command == "vec" {
                output.push('\u{20d7}');
            }
            continue;
        }

        let replacement = match command.as_str() {
            "alpha" => Some('\u{03b1}'),
            "beta" => Some('\u{03b2}'),
            "gamma" => Some('\u{03b3}'),
            "delta" => Some('\u{03b4}'),
            "theta" => Some('\u{03b8}'),
            "lambda" => Some('\u{03bb}'),
            "mu" => Some('\u{03bc}'),
            "pi" => Some('\u{03c0}'),
            "rho" => Some('\u{03c1}'),
            "sigma" => Some('\u{03c3}'),
            "tau" => Some('\u{03c4}'),
            "phi" => Some('\u{03c6}'),
            "omega" => Some('\u{03c9}'),
            "neq" | "ne" => Some('\u{2260}'),
            "leq" => Some('\u{2264}'),
            "geq" => Some('\u{2265}'),
            "times" => Some('\u{00d7}'),
            "cdot" => Some('\u{00b7}'),
            "infty" => Some('\u{221e}'),
            _ => None,
        };
        if let Some(symbol) = replacement {
            output.push(symbol);
        } else {
            output.push('\\');
            output.push_str(&command);
        }
    }
    output
}

fn escape_xml(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

#[cfg(test)]
mod tests {
    use super::{latex_text_to_unicode, render_svg, visible_character_count};

    #[test]
    fn renders_circle_without_tex_runtime() {
        let svg = render_svg(r"\draw (0,0) circle (1cm);").unwrap();
        assert!(svg.contains("<circle"));
        assert!(svg.contains("r=\"37.795\""));
        assert!(svg.contains("width=\"137.386\" height=\"137.386\""));
    }

    #[test]
    fn measures_math_font_wrappers_by_their_visible_arguments() {
        let fallback = latex_text_to_unicode(r"$\boldsymbol{F}_{\mathrm{e}}$");
        assert_eq!(fallback, "F_e");
        assert_eq!(visible_character_count(&fallback), 2);

        let svg = render_svg(
            r"\draw (0,0) -- (0,1);
              \node[right] at (0,0.5) {$\boldsymbol{F}_{\mathrm{e}}$};",
        )
        .unwrap();
        assert!(svg.contains("data-chord-placement=\"right\""));
        assert!(svg.contains("data-chord-anchor-x=\"0.000\""));
    }

    #[test]
    fn exposes_formula_background_padding_for_mathjax_layout() {
        let svg = render_svg(
            r"\node[fill=white, inner sep=1pt] at (0,0) {$A_2$};",
        )
        .unwrap();
        assert!(svg.contains("data-chord-node-background=\"true\""));
        assert!(svg.contains("data-chord-background=\"true\""));
        assert!(svg.contains("data-chord-padding=\"1.328\""));
    }

    #[test]
    fn does_not_treat_multiline_picture_options_as_a_command() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
                scale=1.0,
                >=stealth,
                every node/.style={font=\small},
                box/.style={draw, rounded corners}
            ]
            \draw (0,0) circle (1cm);
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("<circle"));
    }

    #[test]
    fn renders_orbit_diagram_styles_and_math_anchors() {
        let svg = render_svg(
            r"\begin{document}
\begin{tikzpicture}[
  scale=1.0,
  >=stealth,
  line cap=round,
  line join=round,
  every node/.style={font=\small}
]
  \fill (0,0) circle (0.13);
  \node at (-0.45,-0.45) {$M$};
  \draw[thick] (0,0) circle (2.3);
  \fill (1.88,1.32) circle (0.08);
  \node at (2.20,1.50) {$m$};
  \draw[dashed] (0,0) -- (1.88,1.32);
  \node at (0.72,0.78) {$r$};
  \draw[->, very thick] (1.88,1.32) -- (1.12,2.40);
  \node at (1.20,2.58) {$\vec v$};
  \draw[->, very thick] (1.88,1.32) -- (0.45,0.32);
  \node[fill=white, inner sep=1pt] at (1.45,0.5) {$\vec a=\vec g$};
\end{tikzpicture}
\end{document}",
        )
        .unwrap();
        assert!(svg.contains("stroke-dasharray=\"5 4\""));
        assert!(svg.contains("stroke-linecap=\"round\""));
        assert!(svg.contains("stroke-linejoin=\"round\""));
        assert!(svg.contains("data-chord-math=\"\\vec v\""));
        assert!(svg.contains("v\u{20d7}"));
        assert!(svg.contains("a\u{20d7}=g\u{20d7}"));
        assert!(svg.contains("fill=\"var(--background-primary)\""));
        assert!(svg.contains("viewBox=\"0 -5 10 10\""));
        assert!(svg.contains("M 10 0 L 0 4.2 L 2.6 0 L 0 -4.2 Z"));
    }

    #[test]
    fn renders_scaled_control_points_as_a_cubic_curve() {
        let svg = render_svg(
            r"\begin{tikzpicture}[scale=0.95]
  \draw[thick]
    (0.45,-3.0)
    .. controls (0.75,-1.75) and (1.40,-0.85) .. (4.40,-0.28);
\end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("<path d=\"M 16.157,107.717 C "));
        assert!(!svg.contains("<polyline"));
    }

    #[test]
    fn renders_simple_foreach_circles() {
        let svg = render_svg(
            r"\foreach \r in {0.8,1.5,2.3}{
                \draw[dashed] (0,0) circle (\r);
            }",
        )
        .unwrap();
        assert_eq!(svg.matches("<circle").count(), 3);
        assert_eq!(svg.matches("stroke-dasharray=\"5 4\"").count(), 3);
    }

    #[test]
    fn renders_numeric_macros_without_a_tex_runtime() {
        let svg = render_svg(
            r"\def\a{3.4}
              \def\b{2.0}
              \pgfmathsetmacro{\c}{sqrt(\a*\a-\b*\b)}
              \draw (0,0) circle (\c);",
        )
        .unwrap();
        assert!(svg.contains("r=\"103.920\""));
    }

    #[test]
    fn renders_macro_driven_ellipse_and_parametric_sectors() {
        let svg = render_svg(
            r"\begin{tikzpicture}
              \def\a{3.4}
              \def\b{2.0}
              \pgfmathsetmacro{\c}{sqrt(\a*\a-\b*\b)}
              \draw[thick] (0,0) ellipse [x radius=\a, y radius=\b];
              \fill[black!12]
                (-\c,0) --
                plot[domain=140:200, samples=50]
                  ({\a*cos(\x)},{\b*sin(\x)}) -- cycle;
              \fill[black!12]
                (-\c,0) --
                plot[domain=-4:4, samples=30]
                  ({\a*cos(\x)},{\b*sin(\x)}) -- cycle;
              \draw (-\c,0) -- ({\a*cos(140)},{\b*sin(140)});
              \draw (-\c,0) -- ({\a*cos(200)},{\b*sin(200)});
              \draw (-\c,0) -- ({\a*cos(-4)},{\b*sin(-4)});
              \draw (-\c,0) -- ({\a*cos(4)},{\b*sin(4)});
              \fill ({\a*cos(170)},{\b*sin(170)}) circle (0.055);
              \fill ({\a*cos(0)},{\b*sin(0)}) circle (0.055);
              \node[below] at (-\c+0.2,-0.10) {Sun};
              \node at (-2.34,0.72) {$A_1$};
              \node[fill=white, inner sep=1pt] at (0.85,-0.28) {$A_2$};
              \node[align=center] at (0,-2.55)
                {Equal time intervals imply equal swept areas: $A_1=A_2$.};
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("<ellipse"));
        assert_eq!(svg.matches("<path d=").count(), 2);
        assert!(svg.matches(" Z\"").count() >= 2);
        assert_eq!(svg.matches("fill-opacity=\"0.120\"").count(), 2);
        assert!(svg.contains("fill=\"currentColor\" stroke=\"none\""));
        assert!(svg.contains("L -98."));
        assert!(svg.contains("L 128."));
        assert_eq!(svg.matches("<circle").count(), 2);
        assert!(svg.contains("data-chord-math=\"A_1\""));
        assert!(svg.contains("Equal time intervals imply equal swept areas"));
    }

    #[test]
    fn renders_named_node_flowchart_with_orthogonal_feedback() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
              >=stealth,
              every node/.style={font=\small},
              box/.style={
                draw,
                rounded corners,
                minimum width=2.8cm,
                minimum height=0.9cm
              }
            ]
              \node[box] (obs) at (0,0) {现象};
              \node[box] (laws) at (4,0) {Laws};
              \node[box] (theory) at (8,0) {Theory};
              \node[box] (pred) at (12,0) {Predictions};
              \node[box] (exp) at (8,2.2) {Explanation};
              \node[box] (newobs) at (12,-2.2) {New\\observations};
              \draw[->,thick] (obs) -- (laws);
              \draw[->,thick] (laws) -- (theory);
              \draw[->,thick] (theory) -- (pred);
              \draw[->,thick] (theory) -- (exp);
              \draw[->,thick] (pred) -- (newobs);
              \draw[->,thick]
                (newobs.west) -- (obs.south |- newobs.west)
                -- (obs.south);
            \end{tikzpicture}",
        )
        .unwrap();
        assert_eq!(svg.matches("<rect").count(), 6);
        assert_eq!(svg.matches("<polyline").count(), 6);
        assert!(svg.contains("rx=\"4\" ry=\"4\""));
        assert_eq!(svg.matches("<tspan").count(), 2);
        assert!(svg.contains(">现象</text>"));
    }

    #[test]
    fn renders_foreach_ranges_and_mixed_multiline_node_text() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
              box/.style={draw, rounded corners, minimum width=2.8cm}
            ]
              \foreach \angle in {0,45,...,315}{
                \draw (0,0) -- ({2.8*cos(\angle)},{2.8*sin(\angle)});
              }
              \node[box] (Ep1) at (0,0.8)
                {potential energy 势能 \\$E_{\mathrm p}$};
            \end{tikzpicture}",
        )
        .unwrap();
        assert_eq!(svg.matches("<polyline").count(), 8);
        assert_eq!(svg.matches("<rect").count(), 1);
        assert!(svg.contains("potential energy 势能"));
        assert_eq!(svg.matches("<tspan").count(), 2);
    }

    #[test]
    fn emits_mathjax_anchors_for_mixed_flowchart_labels() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
              >=stealth,
              thick,
              every node/.style={font=\small},
              box/.style={
                draw,
                rounded corners,
                align=center,
                minimum width=3.1cm,
                minimum height=1.0cm
              }
            ]
              \node[font=\bfseries] at (6,5.22)
                {Mechanics-based perspective};
              \node[box] (F1) at (0,4.0) {force\\$F$};
              \node[box] (g1) at (5.8,4.0) {field strength\\$g$};
              \node[box] (Ep1) at (0,0.8)
                {potential energy 势能 \\$E_{\mathrm p}$};
              \node[box] (V1) at (5.8,0.8) {potential\\$V$};
              \draw[<->, dashed] (g1)--(V1);
              \node[right, xshift=3pt] at (6.1,2.4)
                {$g=-\Delta V/\Delta r$};
              \draw[<->, dashed] (F1)--(Ep1);
              \node[right, xshift=3pt] at (0.2,2.4)
                {$W_{\mathrm g}=-\Delta E_{\mathrm p}$};
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("data-chord-text=\"force\\\\$F$\""));
        assert!(svg.contains("data-chord-text=\"potential energy 势能"));
        assert!(svg.contains("data-chord-math=\"g=-\\Delta V/\\Delta r\""));
        assert!(svg.contains("data-chord-font-weight=\"700\""));
        assert!(svg.contains("marker-start=\"url(#chord-arrow)\""));
        assert!(svg.contains("stroke-width=\"1.063\""));
    }

    #[test]
    fn keeps_rho_and_tau_distinct_in_cjk_text() {
        let svg = render_svg(r"\node at (0,0) {中文 $\rho\ne\tau$};").unwrap();
        assert!(svg.contains("中文 ρ≠τ"));
        assert!(!svg.contains("ρ≠ρ"));
    }

    #[test]
    fn rejects_unknown_commands_instead_of_drawing_something_false() {
        let error = render_svg(r"\shade (0,0) circle (1);").unwrap_err();
        assert!(error.contains("does not support"));
    }

    #[test]
    fn rejects_unknown_path_options_instead_of_ignoring_them() {
        let error =
            render_svg(r"\draw[opacity=0.5] (0,0) -- (1,1);").unwrap_err();
        assert!(error.contains("path option"));
    }

    #[test]
    fn renders_foreach_magnetic_field_arcs() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
                scale=1.0,
                >=stealth,
                line cap=round,
                line join=round,
                every node/.style={font=\small}
              ]
              \node at (-3,2.8) {current out of the page};
              \draw[thick] (-3,0) circle (0.20);
              \fill (-3,0) circle (0.055);
              \foreach \r in {0.55,0.95,1.45,2.10}{
                \draw[thick] (-3,0) circle (\r);
                \draw[->, thick]
                  ({-3+\r*cos(-25)},{\r*sin(-25)})
                  arc[start angle=-25,end angle=25,radius=\r];
              }
              \node at (3,2.8) {current into the page};
              \draw[thick] (3,0) circle (0.20);
              \draw[thick] (2.91,-0.09)--(3.09,0.09);
              \draw[thick] (2.91,0.09)--(3.09,-0.09);
              \foreach \r in {0.55,0.95,1.45,2.10}{
                \draw[thick] (3,0) circle (\r);
                \draw[->, thick]
                  ({3+\r*cos(25)},{\r*sin(25)})
                  arc[start angle=25,end angle=-25,radius=\r];
              }
            \end{tikzpicture}",
        )
        .unwrap();
        assert_eq!(svg.matches(" A ").count(), 8);
        assert!(svg.contains("marker-end=\"url(#chord-arrow)\""));
    }

    #[test]
    fn renders_parenthesized_ellipse_and_chained_cubic_curves() {
        let svg = render_svg(
            r"\begin{tikzpicture}[scale=1.0, >=stealth]
              \draw[very thick] (0,0) ellipse (0.62 and 1.80);
              \node[font=\bfseries\Large] at (0,1.80) {$\odot$};
              \draw[thick]
                (-2.70,0.32)
                .. controls (-1.50,0.20) and (1.50,0.20) ..
                (2.70,0.32)
                .. controls (2.55,1.65) and (1.50,2.25) ..
                (0,2.35)
                .. controls (-1.50,2.25) and (-2.55,1.65) ..
                (-2.70,0.32);
              \draw[thick]
                (-2.70,-0.32)
                .. controls (-1.50,-0.20) and (1.50,-0.20) ..
                (2.70,-0.32)
                .. controls (2.55,-1.65) and (1.50,-2.25) ..
                (0,-2.35)
                .. controls (-1.50,-2.25) and (-2.55,-1.65) ..
                (-2.70,-0.32);
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("<ellipse"));
        assert_eq!(svg.matches(" C ").count(), 6);
        assert!(svg.contains("font-size=\"19.128\""));
        assert!(svg.contains("data-chord-font-weight=\"700\""));
    }

    #[test]
    fn expands_supported_named_path_styles_and_shortens_lines() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
                timeline/.style={very thick, ->, shorten >=1pt, shorten <=1pt}
              ]
              \draw[timeline] (0,0)--(4,0);
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("stroke-width=\"1.594\""));
        assert!(svg.contains("marker-end=\"url(#chord-arrow)\""));
        assert!(!svg.contains("points=\"0.000,-0.000 151.181,-0.000\""));
    }

    #[test]
    fn renders_all_basic_arrow_directions_with_a_visible_fallback() {
        let svg = render_svg(
            r"\begin{tikzpicture}[>=stealth]
              \draw[->] (0,0)--(2,0);
              \draw[<-] (0,-1)--(2,-1);
              \draw[<->] (0,-2)--(2,-2);
            \end{tikzpicture}",
        )
        .unwrap();
        assert_eq!(svg.matches("marker-start=").count(), 2);
        assert_eq!(svg.matches("marker-end=").count(), 2);
        assert!(svg.contains("fill=\"currentColor\" style=\"fill:context-stroke\""));
    }
}
