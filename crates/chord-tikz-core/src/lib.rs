use std::collections::BTreeMap;
use std::fmt::Write;
use std::sync::Mutex;

mod preprocess;

use preprocess::{evaluate_numeric_expression, preprocess};

// Match the PDF coordinate system used by the local TeX backend. TeX points
// are converted to PDF big points by dvipdfmx before PDF.js applies the shared
// display scale.
const UNIT: f64 = 72.0 / 2.54;
const TEX_POINT: f64 = 72.0 / 72.27;
const DISPLAY_SCALE: f64 = 1.5;
const MAX_SOURCE_BYTES: usize = 64 * 1024;
const MAX_OUTPUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_SCOPE_SHIFT: f64 = 1000.0 * UNIT;
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

struct ScopedCommand<'a> {
    source: &'a str,
    shift: Point,
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
    arrow_tip: ArrowTip,
    dash_array: Option<&'static str>,
    smooth: bool,
    round_cap: bool,
    round_join: bool,
    shorten_start: f64,
    shorten_end: f64,
    grid_step_x: f64,
    grid_step_y: f64,
}

struct PictureStyle {
    round_cap: bool,
    round_join: bool,
    coordinate_scale: f64,
    stroke_width: f64,
    arrow_tip: ArrowTip,
}

#[derive(Clone, Copy, Default, PartialEq, Eq)]
enum ArrowTip {
    #[default]
    Stealth,
    Latex,
}

#[derive(Clone, Copy)]
struct NodeGeometry {
    center: Point,
    width: f64,
    height: f64,
    shape: NodeShape,
}

#[derive(Clone, Copy)]
struct NodePlacement {
    name: &'static str,
    gap: f64,
}

struct InlinePathNode {
    options: String,
    coordinate_index: usize,
    implicit: bool,
    text: String,
}

#[derive(Clone, Copy, Default, PartialEq)]
enum NodeAlign {
    #[default]
    Center,
    Left,
}

#[derive(Clone, Copy)]
enum NodeAnchor {
    Center,
    North,
    South,
    East,
    West,
    NorthEast,
    NorthWest,
    SouthEast,
    SouthWest,
}

#[derive(Clone, Copy, Default, PartialEq)]
enum NodeShape {
    #[default]
    Rectangle,
    Circle,
}

#[derive(Clone)]
struct NodeStyle {
    draw: bool,
    rounded_radius: f64,
    fill: Option<(String, f64)>,
    minimum_width: f64,
    minimum_height: f64,
    text_width: Option<f64>,
    inner_xsep: f64,
    inner_ysep: f64,
    outer_sep: f64,
    font_size: f64,
    bold: bool,
    italic: bool,
    align: NodeAlign,
    anchor: NodeAnchor,
    rotate: f64,
    sloped: bool,
    shape: NodeShape,
}

impl Default for NodeStyle {
    fn default() -> Self {
        let font_size = 10.0 * TEX_POINT;
        Self {
            draw: false,
            rounded_radius: 0.0,
            fill: None,
            minimum_width: 0.0,
            minimum_height: 0.0,
            text_width: None,
            inner_xsep: font_size / 3.0,
            inner_ysep: font_size / 3.0,
            outer_sep: 0.5 * TEX_POINT,
            font_size,
            bold: false,
            italic: false,
            align: NodeAlign::Center,
            anchor: NodeAnchor::Center,
            rotate: 0.0,
            sloped: false,
            shape: NodeShape::Rectangle,
        }
    }
}

#[derive(Clone, Default)]
struct NodeStylePatch {
    draw: bool,
    rounded_radius: Option<f64>,
    fill: Option<(String, f64)>,
    minimum_width: Option<f64>,
    minimum_height: Option<f64>,
    text_width: Option<f64>,
    inner_xsep: Option<f64>,
    inner_ysep: Option<f64>,
    outer_sep: Option<f64>,
    font_size: Option<f64>,
    bold: Option<bool>,
    italic: Option<bool>,
    align: Option<NodeAlign>,
    anchor: Option<NodeAnchor>,
    rotate: Option<f64>,
    sloped: bool,
    shape: Option<NodeShape>,
}

impl NodeStyle {
    fn apply(&mut self, patch: &NodeStylePatch) {
        self.draw |= patch.draw;
        if let Some(value) = patch.rounded_radius {
            self.rounded_radius = value;
        }
        if let Some(value) = &patch.fill {
            self.fill = Some(value.clone());
        }
        if let Some(value) = patch.minimum_width {
            self.minimum_width = value;
        }
        if let Some(value) = patch.minimum_height {
            self.minimum_height = value;
        }
        if let Some(value) = patch.text_width {
            self.text_width = Some(value);
        }
        if let Some(value) = patch.inner_xsep {
            self.inner_xsep = value;
        }
        if let Some(value) = patch.inner_ysep {
            self.inner_ysep = value;
        }
        if let Some(value) = patch.outer_sep {
            self.outer_sep = value;
        }
        if let Some(value) = patch.font_size {
            self.font_size = value;
        }
        if let Some(value) = patch.bold {
            self.bold = value;
        }
        if let Some(value) = patch.italic {
            self.italic = value;
        }
        if let Some(value) = patch.align {
            self.align = value;
        }
        if let Some(value) = patch.anchor {
            self.anchor = value;
        }
        if let Some(value) = patch.rotate {
            self.rotate = value;
        }
        self.sloped |= patch.sloped;
        if let Some(value) = patch.shape {
            self.shape = value;
        }
    }
}

fn render_svg(source: &str) -> Result<String, String> {
    let cleaned = strip_comments(source);
    let expanded = preprocess(&cleaned)?;
    let picture_options = tikz_picture_options(&expanded);
    let picture_style = parse_picture_style(picture_options);
    let base_node_style = parse_every_node_style(picture_options);
    let node_styles = parse_named_node_styles(picture_options);
    let path_styles = parse_named_path_styles(picture_options);
    validate_picture_options(picture_options, &path_styles)?;
    let body = tikz_body(&expanded);
    let commands = split_scoped_commands(body)?;
    let mut elements = String::new();
    let mut bounds = Bounds::empty();
    let mut rendered_commands = 0usize;
    let mut named_nodes = BTreeMap::new();

    for scoped_command in commands {
        let command = scoped_command.source.trim();
        let scope_shift = scoped_command.shift;
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
            let (path, inline_nodes) = extract_inline_path_nodes(path.trim())?;
            render_path(
                &path,
                &style,
                picture_style.coordinate_scale,
                scope_shift,
                &named_nodes,
                &mut elements,
                &mut bounds,
            )?;
            let inline_points = if inline_nodes.is_empty() {
                Vec::new()
            } else {
                parse_path_coordinates(
                    &path,
                    &named_nodes,
                    picture_style.coordinate_scale,
                    scope_shift,
                )?
            };
            for node in inline_nodes {
                let (position, mut options) =
                    inline_node_position_and_options(&node.options, node.implicit)?;
                let coordinate = inline_node_coordinate(
                    &inline_points,
                    node.coordinate_index,
                    node.implicit,
                    position,
                )?;
                if split_top_level_commas(&options)
                    .iter()
                    .any(|option| option.trim() == "sloped")
                {
                    let angle = inline_node_upright_angle(
                        &inline_points,
                        node.coordinate_index,
                        node.implicit,
                    )?;
                    if !options.is_empty() {
                        options.push(',');
                    }
                    write!(options, "rotate={angle:.12}")
                        .map_err(|_| "Could not create sloped node options.".to_owned())?;
                }
                let options = if options.is_empty() {
                    String::new()
                } else {
                    format!("[{options}] ")
                };
                let rest = format!(
                    "{options}at ({:.12}bp,{:.12}bp) {{{}}}",
                    coordinate.x, coordinate.y, node.text
                );
                render_node(
                    &rest,
                    &picture_style,
                    &base_node_style,
                    &node_styles,
                    Point { x: 0.0, y: 0.0 },
                    &mut named_nodes,
                    &mut elements,
                    &mut bounds,
                )?;
            }
            rendered_commands += 1;
            continue;
        }
        if let Some(rest) = command.strip_prefix("\\node") {
            render_node(
                rest.trim(),
                &picture_style,
                &base_node_style,
                &node_styles,
                scope_shift,
                &mut named_nodes,
                &mut elements,
                &mut bounds,
            )?;
            rendered_commands += 1;
            continue;
        }
        if let Some(rest) = command.strip_prefix("\\coordinate") {
            render_coordinate(
                rest.trim(),
                picture_style.coordinate_scale,
                scope_shift,
                &mut named_nodes,
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
    svg.push_str("<g data-chord-tikz-content=\"true\">");
    svg.push_str(&elements);
    svg.push_str("</g></svg>");
    Ok(svg)
}

fn render_coordinate(
    rest: &str,
    coordinate_scale: f64,
    scope_shift: Point,
    named_nodes: &mut BTreeMap<String, NodeGeometry>,
) -> Result<(), String> {
    let rest = rest.trim();
    if !rest.starts_with('(') {
        return Err("A \\coordinate command needs a name.".to_owned());
    }
    let name_end = matching_parenthesis(rest, 0)?;
    let name = rest[1..name_end].trim();
    if name.is_empty() {
        return Err("A \\coordinate command needs a name.".to_owned());
    }
    let after_name = rest[name_end + 1..].trim();
    let after_at = after_name
        .strip_prefix("at")
        .ok_or_else(|| "A \\coordinate command needs 'at (x,y)'.".to_owned())?
        .trim();
    let (mut point, _) = parse_coordinate_at(after_at, 0)?;
    point.x += scope_shift.x;
    point.y += scope_shift.y;
    point.x *= coordinate_scale;
    point.y *= coordinate_scale;
    named_nodes.insert(
        name.to_owned(),
        NodeGeometry {
            center: point,
            width: 0.0,
            height: 0.0,
            shape: NodeShape::Rectangle,
        },
    );
    Ok(())
}

fn extract_inline_path_nodes(path: &str) -> Result<(String, Vec<InlinePathNode>), String> {
    let mut clean_path = String::with_capacity(path.len());
    let mut nodes = Vec::new();
    let mut cursor = 0usize;
    while let Some(start) = find_inline_node(path, cursor) {
        clean_path.push_str(&path[cursor..start]);
        let coordinate_count = coordinate_tokens(&clean_path)?.len();
        if coordinate_count == 0 {
            return Err("A path node needs a preceding coordinate.".to_owned());
        }
        let implicit = clean_path.trim_end().ends_with("--");
        let mut end = skip_path_whitespace(path, start + "node".len());
        let options = if path.as_bytes().get(end) == Some(&b'[') {
            let close = matching_square_bracket(path, end)?;
            let options = path[end + 1..close].to_owned();
            end = skip_path_whitespace(path, close + 1);
            options
        } else {
            String::new()
        };
        if path.as_bytes().get(end) == Some(&b'(') {
            return Err(
                "This fast WASM core does not support named inline path nodes yet.".to_owned(),
            );
        }
        let (text, consumed) = take_braced(&path[end..])?;
        nodes.push(InlinePathNode {
            options,
            coordinate_index: coordinate_count - 1,
            implicit,
            text: text.to_owned(),
        });
        cursor = end + consumed;
    }
    clean_path.push_str(&path[cursor..]);
    Ok((clean_path, nodes))
}

fn inline_node_position_and_options(
    options: &str,
    implicit: bool,
) -> Result<(f64, String), String> {
    let mut position = implicit.then_some(0.5);
    let mut remaining = Vec::new();
    for option in split_top_level_commas(options) {
        let option = option.trim();
        let named_position = match option {
            "at start" => Some(0.0),
            "very near start" => Some(0.125),
            "near start" => Some(0.25),
            "midway" => Some(0.5),
            "near end" => Some(0.75),
            "very near end" => Some(0.875),
            "at end" => Some(1.0),
            _ => None,
        };
        if let Some(value) = named_position {
            position = Some(value);
        } else if let Some(value) = assignment_value(option, "pos") {
            let value = value
                .parse::<f64>()
                .map_err(|_| format!("Invalid TikZ node path position: {value}"))?;
            if !value.is_finite() || !(0.0..=1.0).contains(&value) {
                return Err(format!(
                    "TikZ node path position must be between 0 and 1: {value}"
                ));
            }
            position = Some(value);
        } else {
            remaining.push(option);
        }
    }
    Ok((position.unwrap_or(1.0), remaining.join(",")))
}

fn inline_node_coordinate(
    points: &[Point],
    coordinate_index: usize,
    implicit: bool,
    position: f64,
) -> Result<Point, String> {
    let end_index = if implicit {
        coordinate_index + 1
    } else {
        coordinate_index
    };
    let end = points
        .get(end_index)
        .copied()
        .ok_or_else(|| "An inline path node needs a following coordinate.".to_owned())?;
    if position >= 1.0 || end_index == 0 {
        return Ok(end);
    }
    let start = points
        .get(end_index - 1)
        .copied()
        .ok_or_else(|| "An inline path node needs a preceding coordinate.".to_owned())?;
    Ok(Point {
        x: start.x + (end.x - start.x) * position,
        y: start.y + (end.y - start.y) * position,
    })
}

fn inline_node_upright_angle(
    points: &[Point],
    coordinate_index: usize,
    implicit: bool,
) -> Result<f64, String> {
    let end_index = if implicit {
        coordinate_index + 1
    } else {
        coordinate_index
    };
    if end_index == 0 {
        return Err("A sloped path node needs a preceding line segment.".to_owned());
    }
    let start = points
        .get(end_index - 1)
        .copied()
        .ok_or_else(|| "A sloped path node needs a preceding coordinate.".to_owned())?;
    let end = points
        .get(end_index)
        .copied()
        .ok_or_else(|| "A sloped path node needs a following coordinate.".to_owned())?;
    let mut angle = (end.y - start.y).atan2(end.x - start.x).to_degrees();
    if angle > 90.0 {
        angle -= 180.0;
    } else if angle < -90.0 {
        angle += 180.0;
    }
    Ok(angle)
}

fn find_inline_node(path: &str, start: usize) -> Option<usize> {
    let mut brace_depth = 0usize;
    let mut bracket_depth = 0usize;
    let mut cursor = start;
    while cursor < path.len() {
        let character = path[cursor..].chars().next()?;
        if brace_depth == 0 && bracket_depth == 0 && path[cursor..].starts_with("node") {
            let before = path[..cursor].chars().next_back();
            let after = path[cursor + "node".len()..].chars().next();
            if before.is_none_or(|value| {
                value.is_whitespace() || matches!(value, ')' | '-' | '.')
            })
                && after
                    .is_none_or(|value| value.is_whitespace() || matches!(value, '[' | '{' | '('))
            {
                return Some(cursor);
            }
        }
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            '[' if brace_depth == 0 => bracket_depth += 1,
            ']' if brace_depth == 0 => bracket_depth = bracket_depth.saturating_sub(1),
            _ => {}
        }
        cursor += character.len_utf8();
    }
    None
}

fn skip_path_whitespace(source: &str, mut cursor: usize) -> usize {
    while let Some(character) = source[cursor..].chars().next() {
        if !character.is_whitespace() {
            break;
        }
        cursor += character.len_utf8();
    }
    cursor
}

fn matching_square_bracket(input: &str, start: usize) -> Result<usize, String> {
    if input.as_bytes().get(start) != Some(&b'[') {
        return Err("Expected TikZ node options.".to_owned());
    }
    let mut depth = 0usize;
    for (relative, character) in input[start..].char_indices() {
        match character {
            '[' => depth += 1,
            ']' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return Ok(start + relative);
                }
            }
            _ => {}
        }
    }
    Err("TikZ node options are missing ']'.".to_owned())
}

fn render_path(
    path: &str,
    style: &Style,
    coordinate_scale: f64,
    scope_shift: Point,
    named_nodes: &BTreeMap<String, NodeGeometry>,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    if path.contains("plot[") {
        return render_plot_path(
            path,
            style,
            coordinate_scale,
            scope_shift,
            output,
            bounds,
        );
    }
    if style.smooth
        && let Some(plot_index) = path.find("plot coordinates")
    {
        return render_smooth_coordinate_plot(
            "smooth",
            path[plot_index + "plot coordinates".len()..].trim_start(),
            style,
            coordinate_scale,
            scope_shift,
            output,
            bounds,
        );
    }
    let mut points =
        parse_path_coordinates(path, named_nodes, coordinate_scale, scope_shift)?
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
        let radius = if radius_text.starts_with('[') {
            let (options, _) = take_options(radius_text)?;
            option_value(options, "radius")
                .ok_or_else(|| "A circle needs a radius.".to_owned())
                .and_then(parse_length)?
        } else {
            parse_parenthesized_scalar(radius_text)?
        } * coordinate_scale;
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
    if let Some(arc_index) = path
        .find("arc(")
        .or_else(|| path.find("arc "))
    {
        return render_arc(
            first,
            path[arc_index + "arc".len()..].trim_start(),
            style,
            coordinate_scale,
            output,
            bounds,
        );
    }
    if has_path_operator(path, "grid") {
        let second = points
            .get(1)
            .copied()
            .ok_or_else(|| "A grid needs two coordinates.".to_owned())?;
        return render_grid(
            first,
            second,
            style,
            coordinate_scale,
            output,
            bounds,
        );
    }
    if has_path_operator(path, "rectangle") {
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
        render_arrowheads(
            points[0],
            points[1],
            points[points.len() - 2],
            *points.last().unwrap_or(&points[0]),
            style,
            output,
            bounds,
        )?;
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
    let connector_attributes = if points.len() == 2 && !path.contains("cycle") {
        connector_data_attributes(path, named_nodes, style)?
    } else {
        None
    };
    if let Some(attributes) = &connector_attributes {
        write!(output, "<g {attributes}>")
            .map_err(|_| "Could not create SVG connector group.".to_owned())?;
    }
    if path.contains("cycle") {
        write!(
            output,
            "<polygon points=\"{}\" {}/>",
            point_list,
            style_attributes(style)
        )
        .map_err(|_| "Could not create closed SVG path.".to_owned())?;
    } else {
        write!(
            output,
            "<polyline points=\"{}\" {}/>",
            point_list,
            style_attributes(style)
        )
        .map_err(|_| "Could not create SVG path.".to_owned())?;
    }
    render_arrowheads(
        points[0],
        points[1],
        points[points.len() - 2],
        *points.last().unwrap_or(&points[0]),
        style,
        output,
        bounds,
    )?;
    if connector_attributes.is_some() {
        output.push_str("</g>");
    }
    Ok(())
}

fn has_path_operator(path: &str, operator: &str) -> bool {
    path.match_indices(operator).any(|(index, _)| {
        let before = path[..index].chars().rev().find(|character| !character.is_whitespace());
        let after = path[index + operator.len()..]
            .chars()
            .find(|character| !character.is_whitespace());
        before == Some(')') && matches!(after, Some('(' | '['))
    })
}

fn connector_data_attributes(
    path: &str,
    named_nodes: &BTreeMap<String, NodeGeometry>,
    style: &Style,
) -> Result<Option<String>, String> {
    let tokens = coordinate_tokens(path)?;
    let start = tokens
        .first()
        .and_then(|token| named_node_reference(token, named_nodes));
    let end = tokens
        .last()
        .and_then(|token| named_node_reference(token, named_nodes));
    if start.is_none() || end.is_none() {
        return Ok(None);
    }
    Ok(Some(format!(
        "data-chord-node-connector=\"true\" data-chord-shorten-start=\"{:.3}\" data-chord-shorten-end=\"{:.3}\"{}{}",
        style.shorten_start,
        style.shorten_end,
        start
            .map(|value| format!(
                " data-chord-start-reference=\"{}\"",
                escape_xml(value)
            ))
            .unwrap_or_default(),
        end.map(|value| format!(
            " data-chord-end-reference=\"{}\"",
            escape_xml(value)
        ))
        .unwrap_or_default(),
    )))
}

fn named_node_reference<'a>(
    token: &'a str,
    named_nodes: &BTreeMap<String, NodeGeometry>,
) -> Option<&'a str> {
    let token = token.trim();
    let name = token.split_once('.').map_or(token, |(name, _)| name).trim();
    named_nodes.contains_key(name).then_some(token)
}

fn render_grid(
    first: Point,
    second: Point,
    style: &Style,
    coordinate_scale: f64,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    let min_x = first.x.min(second.x);
    let max_x = first.x.max(second.x);
    let min_y = first.y.min(second.y);
    let max_y = first.y.max(second.y);
    let step_x = style.grid_step_x * coordinate_scale;
    let step_y = style.grid_step_y * coordinate_scale;
    if !step_x.is_finite() || !step_y.is_finite() || step_x <= 0.0 || step_y <= 0.0 {
        return Err("A TikZ grid needs positive finite steps.".to_owned());
    }
    let column_intervals = ((max_x - min_x) / step_x).floor();
    let row_intervals = ((max_y - min_y) / step_y).floor();
    if !column_intervals.is_finite()
        || !row_intervals.is_finite()
        || column_intervals > 1023.0
        || row_intervals > 1023.0
    {
        return Err("A TikZ grid exceeds the 1024-line safety limit.".to_owned());
    }
    let columns = column_intervals as usize + 1;
    let rows = row_intervals as usize + 1;
    if !matches!(columns.checked_add(rows), Some(line_count) if line_count <= 1024) {
        return Err("A TikZ grid exceeds the 1024-line safety limit.".to_owned());
    }
    let mut data = String::new();
    for index in 0..columns {
        let x = min_x + index as f64 * step_x;
        write!(data, "M {x:.3},{:.3} L {x:.3},{:.3} ", -min_y, -max_y)
            .map_err(|_| "Could not create SVG grid data.".to_owned())?;
    }
    for index in 0..rows {
        let y = min_y + index as f64 * step_y;
        write!(data, "M {min_x:.3},{:.3} L {max_x:.3},{:.3} ", -y, -y)
            .map_err(|_| "Could not create SVG grid data.".to_owned())?;
    }
    bounds.include(Point { x: min_x, y: -min_y });
    bounds.include(Point { x: max_x, y: -max_y });
    write!(output, "<path d=\"{}\" {}/>", data.trim(), style_attributes(style))
        .map_err(|_| "Could not create SVG grid.".to_owned())
}

fn render_plot_path(
    path: &str,
    style: &Style,
    coordinate_scale: f64,
    scope_shift: Point,
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
    let after_options = path[options_end + 1..].trim_start();
    if let Some(coordinates) = after_options.strip_prefix("coordinates") {
        return render_smooth_coordinate_plot(
            options,
            coordinates.trim_start(),
            style,
            coordinate_scale,
            scope_shift,
            output,
            bounds,
        );
    }
    let domain = option_value(options, "domain")
        .ok_or_else(|| "A lightweight TikZ plot needs a domain.".to_owned())?;
    let (domain_start, domain_end) = domain
        .split_once(':')
        .ok_or_else(|| "A TikZ plot domain needs start:end.".to_owned())?;
    let domain_start = evaluate_numeric_expression(domain_start.trim())?;
    let domain_end = evaluate_numeric_expression(domain_end.trim())?;
    for option in split_top_level_commas(options) {
        let name = option
            .split_once('=')
            .map(|(name, _)| name.trim())
            .ok_or_else(|| format!("Invalid TikZ plot option: {option}"))?;
        if !matches!(name, "domain" | "samples") {
            return Err(format!(
                "This fast WASM core does not support the plot option yet: {name}"
            ));
        }
    }
    let samples = option_value(options, "samples")
        .map(|value| value.trim().parse::<usize>())
        .transpose()
        .map_err(|_| "TikZ plot samples must be an integer.".to_owned())?
        .unwrap_or(25);
    if !(2..=256).contains(&samples) {
        return Err("TikZ plot samples must be between 2 and 256.".to_owned());
    }

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
            x: (point.x + scope_shift.x) * coordinate_scale,
            y: (point.y + scope_shift.y) * coordinate_scale,
        })
        .collect::<Vec<_>>();
    for index in 0..samples {
        let fraction = index as f64 / (samples - 1) as f64;
        let variable = domain_start + (domain_end - domain_start) * fraction;
        let variable = format!("{variable:.12}");
        let x = (
            evaluate_plot_expression(x_expression, &variable)? * UNIT +
            scope_shift.x
        ) * coordinate_scale;
        let y = (
            evaluate_plot_expression(y_expression, &variable)? * UNIT +
            scope_shift.y
        ) * coordinate_scale;
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
    if points.len() >= 2 {
        render_arrowheads(
            points[0],
            points[1],
            points[points.len() - 2],
            *points.last().unwrap_or(&points[0]),
            style,
            output,
            bounds,
        )?;
    }
    Ok(())
}

fn render_smooth_coordinate_plot(
    options: &str,
    source: &str,
    style: &Style,
    coordinate_scale: f64,
    scope_shift: Point,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    let supported = split_top_level_commas(options)
        .iter()
        .all(|option| matches!(option.trim(), "" | "smooth"));
    if !supported {
        return Err(format!(
            "This fast WASM core only supports the smooth coordinate plot option: {options}"
        ));
    }
    let (coordinates, _) = take_braced(source)?;
    let points = parse_coordinates(coordinates)?
        .into_iter()
        .map(|point| Point {
            x: (point.x + scope_shift.x) * coordinate_scale,
            y: (point.y + scope_shift.y) * coordinate_scale,
        })
        .collect::<Vec<_>>();
    if points.len() < 2 || points.len() > 512 {
        return Err("A smooth coordinate plot needs between 2 and 512 points.".to_owned());
    }

    // PGF's default plot tension is 0.5 * 0.2775 = 0.13875.
    // Its open smooth handler pins the first and final outer controls to
    // the endpoints and uses the adjacent-point difference at interiors.
    const PGF_DEFAULT_PLOT_TENSION: f64 = 0.13875;
    let mut data = format!("M {:.3},{:.3}", points[0].x, -points[0].y);
    let mut first_control2 = points[1];
    let mut last_control1 = points[points.len() - 2];
    for index in 0..points.len() - 1 {
        let p1 = points[index];
        let p2 = points[index + 1];
        let control1 = if index == 0 {
            p1
        } else {
            Point {
                x: p1.x
                    + PGF_DEFAULT_PLOT_TENSION
                        * (p2.x - points[index - 1].x),
                y: p1.y
                    + PGF_DEFAULT_PLOT_TENSION
                        * (p2.y - points[index - 1].y),
            }
        };
        let control2 = if index + 1 == points.len() - 1 {
            p2
        } else {
            Point {
                x: p2.x
                    - PGF_DEFAULT_PLOT_TENSION
                        * (points[index + 2].x - p1.x),
                y: p2.y
                    - PGF_DEFAULT_PLOT_TENSION
                        * (points[index + 2].y - p1.y),
            }
        };
        if index == 0 {
            first_control2 = control2;
        }
        last_control1 = control1;
        for point in [p1, control1, control2, p2] {
            bounds.include(Point {
                x: point.x,
                y: -point.y,
            });
        }
        write!(
            data,
            " C {:.3},{:.3} {:.3},{:.3} {:.3},{:.3}",
            control1.x,
            -control1.y,
            control2.x,
            -control2.y,
            p2.x,
            -p2.y,
        )
        .map_err(|_| "Could not create smooth coordinate plot data.".to_owned())?;
    }
    write!(
        output,
        "<path d=\"{data}\" {}/>",
        style_attributes(style),
    )
    .map_err(|_| "Could not create smooth coordinate plot.".to_owned())?;
    render_arrowheads(
        points[0],
        first_control2,
        last_control1,
        *points.last().unwrap_or(&points[0]),
        style,
        output,
        bounds,
    )
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
    base_style: &NodeStyle,
    named_styles: &BTreeMap<String, NodeStylePatch>,
    scope_shift: Point,
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
        let after_at = after_at.trim();
        let end = matching_parenthesis(after_at, 0)?;
        let coordinate = &after_at[1..end];
        let point = if coordinate.contains(',') || coordinate.contains(':') {
            let mut point = parse_coordinate(coordinate)?;
            point.x += scope_shift.x;
            point.y += scope_shift.y;
            point
        } else {
            resolve_node_reference(coordinate, named_nodes, picture_style.coordinate_scale)?
        };
        (point, &after_at[end + 1..])
    } else {
        (scope_shift, rest)
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
    let node_style = resolve_node_style(options, base_style, named_styles)?;
    let font_size = node_style.font_size;
    let (estimated_width, line_count) =
        estimate_node_text(&text, node_style.text_width, font_size, node_style.bold);
    let mut box_width = (estimated_width + 2.0 * node_style.inner_xsep)
        .max(node_style.minimum_width);
    let mut box_height = (font_size * 1.2 * line_count as f64 + 2.0 * node_style.inner_ysep)
        .max(node_style.minimum_height);
    if node_style.shape == NodeShape::Circle {
        let diameter = box_width.hypot(box_height);
        box_width = diameter;
        box_height = diameter;
    }
    let radians = node_style.rotate.to_radians();
    let visual_width =
        box_width * radians.cos().abs() + box_height * radians.sin().abs();
    let visual_height =
        box_width * radians.sin().abs() + box_height * radians.cos().abs();
    let placement = node_placement(options)?;
    apply_node_position(
        options,
        placement,
        &mut point,
        if node_style.sloped { box_width / 2.0 } else { visual_width / 2.0 },
        if node_style.sloped { box_height / 2.0 } else { visual_height / 2.0 },
        node_style.sloped.then_some(node_style.rotate),
    )?;
    let anchor_reference = point;
    apply_explicit_node_anchor(
        &mut point,
        node_style.anchor,
        visual_width,
        visual_height,
    );
    let anchor_point = placement.map(|placement| {
        node_anchor_point(
            point,
            placement.name,
            placement.gap,
            if node_style.sloped { box_width / 2.0 } else { visual_width / 2.0 },
            if node_style.sloped { box_height / 2.0 } else { visual_height / 2.0 },
            node_style.sloped.then_some(node_style.rotate),
        )
    });
    bounds.include(Point {
        x: point.x - visual_width / 2.0,
        y: -point.y - visual_height / 2.0,
    });
    bounds.include(Point {
        x: point.x + visual_width / 2.0,
        y: -point.y + visual_height / 2.0,
    });
    let rotation_attribute = if node_style.rotate.abs() > f64::EPSILON {
        format!(
            " transform=\"rotate({:.3} {:.3} {:.3})\"",
            -node_style.rotate,
            point.x,
            -point.y,
        )
    } else {
        String::new()
    };
    let node_name_attribute = node_name
        .map(|value| format!(" data-chord-node-name=\"{}\"", escape_xml(value)))
        .unwrap_or_default();
    if node_style.draw || node_style.fill.is_some() || node_name.is_some() {
        let (fill, fill_opacity) = node_style
            .fill
            .as_ref()
            .map(|(color, opacity)| (color.as_str(), *opacity))
            .unwrap_or(("none", 1.0));
        if node_style.shape == NodeShape::Circle {
            write!(
                output,
                "<circle data-chord-node-background=\"true\"{node_name_attribute} cx=\"{:.3}\" cy=\"{:.3}\" r=\"{:.3}\"{rotation_attribute} fill=\"{fill}\" fill-opacity=\"{fill_opacity:.3}\" stroke=\"{}\" stroke-width=\"{:.3}\"/>",
                point.x,
                -point.y,
                box_width / 2.0,
                if node_style.draw { "currentColor" } else { "none" },
                picture_style.stroke_width,
            )
            .map_err(|_| "Could not create SVG circular node.".to_owned())?;
        } else {
            write!(
                output,
                "<rect data-chord-node-background=\"true\"{node_name_attribute} x=\"{:.3}\" y=\"{:.3}\" width=\"{box_width:.3}\" height=\"{box_height:.3}\"{}{rotation_attribute} fill=\"{fill}\" fill-opacity=\"{fill_opacity:.3}\" stroke=\"{}\" stroke-width=\"{:.3}\"/>",
                point.x - box_width / 2.0,
                -point.y - box_height / 2.0,
                if node_style.rounded_radius > 0.0 {
                    format!(
                        " rx=\"{:.3}\" ry=\"{:.3}\"",
                        node_style.rounded_radius, node_style.rounded_radius
                    )
                } else {
                    String::new()
                },
                if node_style.draw { "currentColor" } else { "none" },
                picture_style.stroke_width,
            )
            .map_err(|_| "Could not create SVG node box.".to_owned())?;
        }
    }
    let label_attribute = if let Some(source) = math_source {
        format!(" data-chord-math=\"{}\"", escape_xml(source))
    } else {
        format!(" data-chord-text=\"{}\"", escape_xml(trimmed_text))
    };
    let placement_attribute = placement
        .zip(anchor_point)
        .map(|(placement, anchor)| {
            let gap = node_style.outer_sep + placement.gap;
            let placement = placement.name;
            format!(
                " data-chord-placement=\"{placement}\" data-chord-anchor-x=\"{:.3}\" data-chord-anchor-y=\"{:.3}\" data-chord-gap=\"{gap:.3}\"",
                anchor.x,
                -anchor.y,
            )
        })
        .unwrap_or_default();
    let layout_attributes = format!(
        " data-chord-padding-x=\"{:.3}\" data-chord-padding-y=\"{:.3}\" data-chord-min-width=\"{:.3}\" data-chord-min-height=\"{:.3}\" data-chord-align=\"{}\" data-chord-node-anchor=\"{}\" data-chord-reference-x=\"{:.3}\" data-chord-reference-y=\"{:.3}\"{}{}{}{}",
        node_style.inner_xsep,
        node_style.inner_ysep,
        node_style.minimum_width,
        node_style.minimum_height,
        if node_style.align == NodeAlign::Left { "left" } else { "center" },
        node_anchor_name(node_style.anchor),
        anchor_reference.x,
        -anchor_reference.y,
        node_style
            .text_width
            .map(|value| format!(" data-chord-text-width=\"{value:.3}\""))
            .unwrap_or_default(),
        if node_style.fill.is_some() {
            format!(
                " data-chord-background=\"true\" data-chord-padding=\"{:.3}\"",
                node_style.inner_xsep
            )
        } else {
            String::new()
        },
        if node_style.rotate.abs() > f64::EPSILON {
            format!(" data-chord-rotate=\"{:.3}\"", node_style.rotate)
        } else {
            String::new()
        },
        if node_style.sloped {
            " data-chord-sloped=\"true\"".to_owned()
        } else {
            String::new()
        },
    );
    let label_anchor = format!(
        "{label_attribute} data-chord-x=\"{:.3}\" data-chord-y=\"{:.3}\" data-chord-font-size=\"{font_size:.3}\" data-chord-width=\"{box_width:.3}\"{}{placement_attribute}{layout_attributes}",
        point.x,
        -point.y,
        if node_style.bold
        {
            " data-chord-font-weight=\"700\""
        } else {
            ""
        },
    );
    write!(
        output,
        "<text x=\"{:.3}\" y=\"{:.3}\" text-anchor=\"middle\" dominant-baseline=\"middle\" fill=\"currentColor\" font-family=\"STIX Two Math, Cambria Math, Times New Roman, serif\" font-size=\"{:.3}\"{}{rotation_attribute}{}>",
        point.x,
        -point.y,
        font_size,
        if is_math || node_style.italic { " font-style=\"italic\"" } else { "" },
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
                width: visual_width + 2.0 * node_style.outer_sep,
                height: visual_height + 2.0 * node_style.outer_sep,
                shape: node_style.shape,
            },
        );
    }
    Ok(())
}

fn apply_node_position(
    options: &str,
    placement: Option<NodePlacement>,
    point: &mut Point,
    half_width: f64,
    half_height: f64,
    sloped_angle: Option<f64>,
) -> Result<(), String> {
    let mut x_shift = 0.0;
    let mut y_shift = 0.0;
    for option in options.split(',').map(str::trim) {
        if let Some(value) = assignment_value(option, "xshift") {
            x_shift += parse_length(value)?;
        } else if let Some(value) = assignment_value(option, "yshift") {
            y_shift += parse_length(value)?;
        }
    }
    if let Some(placement) = placement {
        let horizontal = half_width + placement.gap;
        let vertical = half_height + placement.gap;
        let mut local_x = 0.0;
        let mut local_y = 0.0;
        if placement.name.contains("left") {
            local_x -= horizontal;
        } else if placement.name.contains("right") {
            local_x += horizontal;
        }
        if placement.name.contains("above") {
            local_y += vertical;
        } else if placement.name.contains("below") {
            local_y -= vertical;
        }
        if let Some(angle) = sloped_angle {
            let radians = angle.to_radians();
            point.x += local_x * radians.cos() - local_y * radians.sin();
            point.y += local_x * radians.sin() + local_y * radians.cos();
        } else {
            point.x += local_x;
            point.y += local_y;
        }
    }
    point.x += x_shift;
    point.y += y_shift;
    Ok(())
}

fn node_placement(options: &str) -> Result<Option<NodePlacement>, String> {
    for option in options.split(',').map(str::trim) {
        let (direction, gap) = option
            .split_once('=')
            .map(|(direction, gap)| (direction.trim(), Some(gap.trim())))
            .unwrap_or((option, None));
        let name = match direction {
            "above" => Some("above"),
            "below" => Some("below"),
            "left" => Some("left"),
            "right" => Some("right"),
            "above left" | "left above" => Some("above-left"),
            "above right" | "right above" => Some("above-right"),
            "below left" | "left below" => Some("below-left"),
            "below right" | "right below" => Some("below-right"),
            _ => None,
        };
        if let Some(name) = name {
            return Ok(Some(NodePlacement {
                name,
                gap: gap.map(parse_length).transpose()?.unwrap_or(0.0).max(0.0),
            }));
        }
    }
    Ok(None)
}

fn node_anchor_point(
    positioned: Point,
    placement: &str,
    gap: f64,
    half_width: f64,
    half_height: f64,
    sloped_angle: Option<f64>,
) -> Point {
    let mut local_x = 0.0;
    let mut local_y = 0.0;
    if placement.contains("left") {
        local_x -= half_width + gap;
    } else if placement.contains("right") {
        local_x += half_width + gap;
    }
    if placement.contains("above") {
        local_y += half_height + gap;
    } else if placement.contains("below") {
        local_y -= half_height + gap;
    }
    let offset = if let Some(angle) = sloped_angle {
        let radians = angle.to_radians();
        Point {
            x: local_x * radians.cos() - local_y * radians.sin(),
            y: local_x * radians.sin() + local_y * radians.cos(),
        }
    } else {
        Point {
            x: local_x,
            y: local_y,
        }
    };
    Point {
        x: positioned.x - offset.x,
        y: positioned.y - offset.y,
    }
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
    scope_shift: Point,
) -> Result<Vec<Point>, String> {
    let mut points = Vec::new();
    let mut current: Option<Point> = None;
    let mut cursor = 0usize;
    while let Some(relative) = input[cursor..].find('(') {
        let start = cursor + relative;
        let end = matching_parenthesis(input, start)?;
        let coordinate = &input[start + 1..end];
        let prefix = input[..start].trim_end();
        if prefix.ends_with("arc") {
            cursor = end + 1;
            continue;
        }
        let relative_update = prefix.ends_with("++");
        let relative_once = !relative_update && prefix.ends_with('+');
        let numeric_coordinate = coordinate.contains(',') || coordinate.contains(':');
        let mut point = if numeric_coordinate {
            parse_coordinate(coordinate)?
        } else if coordinate.contains("|-") {
            let (vertical, horizontal) = coordinate
                .split_once("|-")
                .ok_or_else(|| "Invalid TikZ orthogonal coordinate.".to_owned())?;
            let vertical =
                resolve_node_reference(vertical.trim(), named_nodes, coordinate_scale)?;
            let horizontal =
                resolve_node_reference(horizontal.trim(), named_nodes, coordinate_scale)?;
            Point {
                x: vertical.x,
                y: horizontal.y,
            }
        } else if coordinate.contains("-|") {
            let (horizontal, vertical) = coordinate
                .split_once("-|")
                .ok_or_else(|| "Invalid TikZ orthogonal coordinate.".to_owned())?;
            let horizontal =
                resolve_node_reference(horizontal.trim(), named_nodes, coordinate_scale)?;
            let vertical =
                resolve_node_reference(vertical.trim(), named_nodes, coordinate_scale)?;
            Point {
                x: vertical.x,
                y: horizontal.y,
            }
        } else if let Ok(point) =
            resolve_node_reference(coordinate.trim(), named_nodes, coordinate_scale)
        {
            point
        } else {
            cursor = end + 1;
            continue;
        };
        if relative_update || relative_once {
            let base = current.ok_or_else(|| {
                "A relative TikZ coordinate needs a preceding coordinate.".to_owned()
            })?;
            point.x += base.x;
            point.y += base.y;
        } else if numeric_coordinate {
            point.x += scope_shift.x;
            point.y += scope_shift.y;
        }
        points.push(point);
        if !relative_once {
            current = Some(point);
        }
        cursor = end + 1;
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
    if node.shape == NodeShape::Circle {
        let radius = node.width.max(node.height) / 2.0;
        let length = delta_x.hypot(delta_y);
        return Point {
            x: node.center.x + delta_x / length * radius,
            y: node.center.y + delta_y / length * radius,
        };
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
    if !input.contains(',') {
        let (angle, radius) = input
            .split_once(':')
            .ok_or_else(|| "A TikZ coordinate needs x,y or angle:radius.".to_owned())?;
        let angle = match angle.trim() {
            "right" => 0.0,
            "up" => 90.0,
            "left" => 180.0,
            "down" => 270.0,
            value => evaluate_numeric_expression(value)?,
        };
        let radius = parse_length(radius)?;
        let radians = angle.to_radians();
        return Ok(Point {
            x: radius * radians.cos(),
            y: radius * radians.sin(),
        });
    }
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
    let units = [
        ("bp", 1.0),
        ("cm", UNIT),
        ("mm", UNIT / 10.0),
        ("pt", TEX_POINT),
        ("in", 72.0),
    ];
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
    let (start_angle, end_angle, radius) = if input.trim_start().starts_with('[') {
        let (options, _) = take_options(input.trim_start())?;
        let start_angle = option_value(options, "start angle")
            .ok_or_else(|| "A TikZ arc needs a start angle.".to_owned())
            .and_then(evaluate_numeric_expression)?;
        let end_angle = option_value(options, "end angle")
            .ok_or_else(|| "A TikZ arc needs an end angle.".to_owned())
            .and_then(evaluate_numeric_expression)?;
        let radius = option_value(options, "radius")
            .ok_or_else(|| "A TikZ arc needs a radius.".to_owned())
            .and_then(parse_length)?;
        (start_angle, end_angle, radius)
    } else {
        let start = input
            .find('(')
            .ok_or_else(|| "A TikZ arc needs '(start:end:radius)'.".to_owned())?;
        let end = matching_parenthesis(input, start)?;
        let values = input[start + 1..end]
            .split(':')
            .map(str::trim)
            .collect::<Vec<_>>();
        if values.len() != 3 {
            return Err("A TikZ arc needs '(start:end:radius)'.".to_owned());
        }
        (
            evaluate_numeric_expression(values[0])?,
            evaluate_numeric_expression(values[1])?,
            parse_length(values[2])?,
        )
    };
    let radius = radius * coordinate_scale;
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
    .map_err(|_| "Could not create SVG arc.".to_owned())?;
    let tangent_sign = delta.signum();
    let start_tangent = Point {
        x: -start_radians.sin() * tangent_sign,
        y: start_radians.cos() * tangent_sign,
    };
    let end_tangent = Point {
        x: -end_radians.sin() * tangent_sign,
        y: end_radians.cos() * tangent_sign,
    };
    render_arrowheads(
        start,
        Point {
            x: start.x + start_tangent.x,
            y: start.y + start_tangent.y,
        },
        Point {
            x: end.x - end_tangent.x,
            y: end.y - end_tangent.y,
        },
        end,
        style,
        output,
        bounds,
    )
}

fn render_arrowheads(
    start: Point,
    next: Point,
    previous: Point,
    end: Point,
    style: &Style,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    if style.arrow_start {
        render_arrowhead(
            start,
            Point {
                x: start.x - next.x,
                y: start.y - next.y,
            },
            style,
            "start",
            output,
            bounds,
        )?;
    }
    if style.arrow_end {
        render_arrowhead(
            end,
            Point {
                x: end.x - previous.x,
                y: end.y - previous.y,
            },
            style,
            "end",
            output,
            bounds,
        )?;
    }
    Ok(())
}

fn render_arrowhead(
    tip: Point,
    direction: Point,
    style: &Style,
    position: &str,
    output: &mut String,
    bounds: &mut Bounds,
) -> Result<(), String> {
    let length = direction.x.hypot(direction.y);
    if length <= f64::EPSILON {
        return Ok(());
    }
    let unit = Point {
        x: direction.x / length,
        y: direction.y / length,
    };
    let normal = Point {
        x: -unit.y,
        y: unit.x,
    };
    let arrow_length = 5.8 * style.stroke_width.max(0.4 * TEX_POINT);
    let half_width = 2.44 * style.stroke_width.max(0.4 * TEX_POINT);
    let notch_distance = 4.29 * style.stroke_width.max(0.4 * TEX_POINT);
    let base = Point {
        x: tip.x - unit.x * arrow_length,
        y: tip.y - unit.y * arrow_length,
    };
    let left = Point {
        x: base.x + normal.x * half_width,
        y: base.y + normal.y * half_width,
    };
    let right = Point {
        x: base.x - normal.x * half_width,
        y: base.y - normal.y * half_width,
    };
    let notch = Point {
        x: tip.x - unit.x * notch_distance,
        y: tip.y - unit.y * notch_distance,
    };
    for point in [tip, left, notch, right] {
        bounds.include(Point {
            x: point.x,
            y: -point.y,
        });
    }
    let data = match style.arrow_tip {
        ArrowTip::Stealth => format!(
            "M {:.3},{:.3} L {:.3},{:.3} L {:.3},{:.3} L {:.3},{:.3} Z",
            tip.x, -tip.y, left.x, -left.y, notch.x, -notch.y, right.x, -right.y,
        ),
        ArrowTip::Latex => format!(
            "M {:.3},{:.3} L {:.3},{:.3} L {:.3},{:.3} Z",
            tip.x, -tip.y, left.x, -left.y, right.x, -right.y,
        ),
    };
    write!(
        output,
        "<path data-chord-arrowhead=\"true\" data-chord-arrow-position=\"{position}\" d=\"{data}\" fill=\"{}\" fill-opacity=\"{:.3}\" stroke=\"none\"/>",
        escape_xml(&style.stroke),
        style.stroke_opacity,
    )
    .map_err(|_| "Could not create SVG arrowhead.".to_owned())
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

fn assignment_value<'a>(option: &'a str, name: &str) -> Option<&'a str> {
    let (key, value) = option.split_once('=')?;
    (key.trim() == name).then_some(value.trim())
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
        arrow_tip: picture_style.arrow_tip,
        dash_array: None,
        smooth: false,
        round_cap: picture_style.round_cap,
        round_join: picture_style.round_join,
        shorten_start: 0.0,
        shorten_end: 0.0,
        grid_step_x: UNIT,
        grid_step_y: UNIT,
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
        } else if option == "ultra thin" {
            style.stroke_width = 0.1 * TEX_POINT;
        } else if option == "very thin" {
            style.stroke_width = 0.2 * TEX_POINT;
        } else if option == "semithick" {
            style.stroke_width = 0.6 * TEX_POINT;
        } else if option == "thick" {
            style.stroke_width = 0.8 * TEX_POINT;
        } else if option == "very thick" {
            style.stroke_width = 1.2 * TEX_POINT;
        } else if option == "ultra thick" {
            style.stroke_width = 1.6 * TEX_POINT;
        } else if option == "dashed" {
            style.dash_array = Some("5 4");
        } else if option == "densely dashed" {
            style.dash_array = Some("5 2");
        } else if option == "loosely dashed" {
            style.dash_array = Some("5 6");
        } else if option == "dotted" {
            style.dash_array = Some("0.01 2.989");
        } else if option == "densely dotted" {
            style.dash_array = Some("0.01 1.993");
        } else if option == "loosely dotted" {
            style.dash_array = Some("0.01 3.985");
        } else if option == "help lines" {
            style.stroke = "gray".to_owned();
            style.stroke_opacity = 0.5;
            style.stroke_width = 0.2 * TEX_POINT;
        } else if option == "smooth" {
            style.smooth = true;
        } else if let Some((arrow_start, arrow_end, arrow_tip)) = parse_arrow_style(option) {
            style.arrow_start = arrow_start;
            style.arrow_end = arrow_end;
            style.arrow_tip = arrow_tip;
        } else if let Some(value) = assignment_value(option, "line width") {
            style.stroke_width = parse_length(value)?.max(0.0);
        } else if let Some(value) = assignment_value(option, "opacity") {
            let opacity = parse_opacity(value)?;
            style.stroke_opacity *= opacity;
            style.fill_opacity *= opacity;
        } else if let Some(value) = assignment_value(option, "draw opacity") {
            style.stroke_opacity *= parse_opacity(value)?;
        } else if let Some(value) = assignment_value(option, "fill opacity") {
            style.fill_opacity *= parse_opacity(value)?;
        } else if let Some(value) = assignment_value(option, "step") {
            let step = parse_length(value)?;
            style.grid_step_x = step;
            style.grid_step_y = step;
        } else if let Some(value) = assignment_value(option, "xstep") {
            style.grid_step_x = parse_length(value)?;
        } else if let Some(value) = assignment_value(option, "ystep") {
            style.grid_step_y = parse_length(value)?;
        } else if let Some(value) = assignment_value(option, "shorten >") {
            style.shorten_end = parse_length(value)?.max(0.0);
        } else if let Some(value) = assignment_value(option, "shorten <") {
            style.shorten_start = parse_length(value)?.max(0.0);
        } else if let Some(color) = assignment_value(option, "draw") {
            let (color, opacity) = svg_color_with_opacity(color);
            style.stroke = color;
            style.stroke_opacity = opacity;
        } else if let Some(color) = assignment_value(option, "fill") {
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

fn parse_arrow_style(option: &str) -> Option<(bool, bool, ArrowTip)> {
    let parse_tip = |value: &str| {
        let value = value
            .strip_prefix('{')
            .and_then(|value| value.strip_suffix('}'))
            .unwrap_or(value);
        match value {
            "Stealth" | "stealth" => Some(ArrowTip::Stealth),
            "Latex" | "latex" => Some(ArrowTip::Latex),
            _ => None,
        }
    };
    if let Some(value) = option.strip_prefix('-') {
        return parse_tip(value).map(|tip| (false, true, tip));
    }
    if let Some(value) = option.strip_suffix('-') {
        return parse_tip(value).map(|tip| (true, false, tip));
    }
    let (start, end) = option.split_once('-')?;
    let start_tip = parse_tip(start)?;
    let end_tip = parse_tip(end)?;
    (start_tip == end_tip).then_some((true, true, end_tip))
}

fn style_attributes(style: &Style) -> String {
    format!(
        "fill=\"{}\" stroke=\"{}\" stroke-width=\"{:.3}\" fill-opacity=\"{:.3}\" stroke-opacity=\"{:.3}\"{}{}{}",
        escape_xml(&style.fill),
        escape_xml(&style.stroke),
        style.stroke_width,
        style.fill_opacity,
        style.stroke_opacity,
        style
            .dash_array
            .map(|value| format!(" stroke-dasharray=\"{value}\""))
            .unwrap_or_default(),
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

fn parse_opacity(value: &str) -> Result<f64, String> {
    let opacity = value
        .trim()
        .parse::<f64>()
        .map_err(|_| format!("Invalid TikZ opacity: {value}"))?;
    if !opacity.is_finite() || !(0.0..=1.0).contains(&opacity) {
        return Err(format!("TikZ opacity must be between 0 and 1: {value}"));
    }
    Ok(opacity)
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
        "black"
            | "white"
            | "red"
            | "green"
            | "blue"
            | "cyan"
            | "magenta"
            | "yellow"
            | "gray"
            | "orange"
            | "violet"
            | "purple"
            | "brown"
            | "lime"
            | "teal"
            | "pink"
    )
}

fn parse_picture_style(options: &str) -> PictureStyle {
    let coordinate_scale = options
        .split(',')
        .find_map(|raw| assignment_value(raw.trim(), "scale"))
        .and_then(|value| value.trim().parse::<f64>().ok())
        .filter(|value| value.is_finite() && *value > 0.0 && *value <= 10.0)
        .unwrap_or(1.0);
    let stroke_width = split_top_level_commas(options).iter().fold(
        0.4 * TEX_POINT,
        |width, option| match option.trim() {
            "ultra thin" => 0.1 * TEX_POINT,
            "very thin" => 0.2 * TEX_POINT,
            "thin" => 0.4 * TEX_POINT,
            "semithick" => 0.6 * TEX_POINT,
            "thick" => 0.8 * TEX_POINT,
            "very thick" => 1.2 * TEX_POINT,
            "ultra thick" => 1.6 * TEX_POINT,
            _ => width,
        },
    );
    PictureStyle {
        round_cap: options.contains("line cap=round"),
        round_join: options.contains("line join=round"),
        coordinate_scale,
        stroke_width,
        arrow_tip: split_top_level_commas(options)
            .iter()
            .find_map(|option| assignment_value(option.trim(), ">"))
            .map(|value| match value {
                "latex" | "Latex" => ArrowTip::Latex,
                _ => ArrowTip::Stealth,
            })
            .unwrap_or_default(),
    }
}

fn validate_picture_options(
    options: &str,
    named_styles: &BTreeMap<String, String>,
) -> Result<(), String> {
    for raw in split_top_level_commas(options) {
        let option = raw.trim();
        if option.is_empty()
            || matches!(
                option,
                "thin"
                    | "ultra thin"
                    | "very thin"
                    | "semithick"
                    | "thick"
                    | "very thick"
                    | "ultra thick"
                    | "line cap=round"
                    | "line join=round"
                    | ">=stealth"
                    | ">=Stealth"
                    | ">=latex"
                    | ">=Latex"
                    | "x=1cm"
                    | "x=1.0cm"
                    | "y=1cm"
                    | "y=1.0cm"
            )
        {
            continue;
        }
        if let Some(value) = assignment_value(option, "scale") {
            let value = value
                .trim()
                .parse::<f64>()
                .map_err(|_| format!("Invalid TikZ picture scale: {value}"))?;
            if value.is_finite() && value > 0.0 && value <= 10.0 {
                continue;
            }
            return Err(format!("Invalid TikZ picture scale: {value}"));
        }
        if let Some(value) = assignment_value(option, ">") {
            if matches!(value, "stealth" | "Stealth" | "latex" | "Latex") {
                continue;
            }
        }
        if let Some(value) = assignment_value(option, "x")
            .or_else(|| assignment_value(option, "y"))
        {
            if matches!(value, "1cm" | "1.0cm") {
                continue;
            }
        }
        let Some((name, definition)) = option.split_once("/.style=") else {
            return Err(format!(
                "This fast WASM core does not support the picture option yet: {option}"
            ));
        };
        let definition = strip_style_braces(definition);
        if name.trim() == "every node" {
            parse_node_style_patch(definition)?;
            continue;
        }
        if parse_node_style_patch(definition).is_ok() {
            continue;
        }
        let mut style = Style::default();
        apply_path_style_options(&mut style, definition, "draw", named_styles, 0)?;
    }
    Ok(())
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

fn parse_every_node_style(options: &str) -> NodeStyle {
    let mut style = NodeStyle::default();
    for option in split_top_level_commas(options) {
        let Some((name, definition)) = option.split_once("/.style=") else {
            continue;
        };
        if name.trim() != "every node" {
            continue;
        }
        let definition = strip_style_braces(definition);
        if let Ok(patch) = parse_node_style_patch(definition) {
            style.apply(&patch);
        }
    }
    style
}

fn parse_named_node_styles(options: &str) -> BTreeMap<String, NodeStylePatch> {
    let mut styles = BTreeMap::new();
    for option in split_top_level_commas(options) {
        let Some((name, definition)) = option.split_once("/.style=") else {
            continue;
        };
        if name.trim() == "every node" {
            continue;
        }
        let definition = strip_style_braces(definition);
        if let Ok(style) = parse_node_style_patch(definition) {
            if is_node_style_patch(&style) {
                styles.insert(name.trim().to_owned(), style);
            }
        }
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

fn strip_style_braces(definition: &str) -> &str {
    definition
        .trim()
        .strip_prefix('{')
        .and_then(|value| value.strip_suffix('}'))
        .unwrap_or(definition.trim())
}

fn resolve_node_style(
    options: &str,
    base: &NodeStyle,
    named_styles: &BTreeMap<String, NodeStylePatch>,
) -> Result<NodeStyle, String> {
    let mut style = base.clone();
    for raw in split_top_level_commas(options) {
        let option = raw.trim();
        if let Some(named) = named_styles.get(option) {
            style.apply(named);
        } else if is_node_position_option(option) {
            continue;
        } else {
            style.apply(&parse_node_style_patch(option)?);
        }
    }
    Ok(style)
}

fn parse_node_style_patch(
    options: &str,
) -> Result<NodeStylePatch, String> {
    let mut style = NodeStylePatch::default();
    for raw in split_top_level_commas(options) {
        let option = raw.trim();
        if option.is_empty() {
            continue;
        } else if option == "draw" {
            style.draw = true;
        } else if option == "circle" {
            style.shape = Some(NodeShape::Circle);
        } else if option == "sloped" {
            style.sloped = true;
        } else if option == "rounded corners" {
            style.rounded_radius = Some(4.0);
        } else if let Some(value) = assignment_value(option, "rounded corners") {
            style.rounded_radius = Some(parse_length(value)?.max(0.0));
        } else if let Some(value) = assignment_value(option, "fill") {
            style.fill = Some(svg_color_with_opacity(value));
        } else if let Some(value) = assignment_value(option, "minimum width") {
            style.minimum_width = Some(parse_length(value)?.max(0.0));
        } else if let Some(value) = assignment_value(option, "minimum height") {
            style.minimum_height = Some(parse_length(value)?.max(0.0));
        } else if let Some(value) = assignment_value(option, "text width") {
            style.text_width = Some(parse_length(value)?.max(0.0));
        } else if let Some(value) = assignment_value(option, "inner sep") {
            let value = parse_length(value)?.max(0.0);
            style.inner_xsep = Some(value);
            style.inner_ysep = Some(value);
        } else if let Some(value) = assignment_value(option, "inner xsep") {
            style.inner_xsep = Some(parse_length(value)?.max(0.0));
        } else if let Some(value) = assignment_value(option, "inner ysep") {
            style.inner_ysep = Some(parse_length(value)?.max(0.0));
        } else if let Some(value) = assignment_value(option, "outer sep") {
            style.outer_sep = Some(parse_length(value)?.max(0.0));
        } else if let Some(value) = assignment_value(option, "font") {
            style.font_size = Some(node_font_size(value, 10.0 * TEX_POINT));
            style.bold = Some(value.contains("\\bfseries"));
            style.italic = Some(value.contains("\\itshape"));
        } else if let Some(value) = assignment_value(option, "align") {
            style.align = Some(match value.trim() {
                "center" => NodeAlign::Center,
                "left" => NodeAlign::Left,
                value => {
                    return Err(format!(
                        "This fast WASM core does not support node alignment yet: {value}"
                    ))
                }
            });
        } else if let Some(value) = assignment_value(option, "anchor") {
            style.anchor = Some(parse_node_anchor(value)?);
        } else if let Some(value) = assignment_value(option, "rotate") {
            let value = value
                .trim()
                .parse::<f64>()
                .map_err(|_| format!("Invalid TikZ node rotation: {value}"))?;
            if !value.is_finite() || value.abs() > 3600.0 {
                return Err(format!("Invalid TikZ node rotation: {value}"));
            }
            style.rotate = Some(value);
        } else {
            return Err(format!(
                "This fast WASM core does not support the node option yet: {option}"
            ));
        }
    }
    Ok(style)
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

fn is_node_style_patch(style: &NodeStylePatch) -> bool {
    style.draw
        || style.rounded_radius.is_some()
        || style.fill.is_some()
        || style.minimum_width.is_some()
        || style.minimum_height.is_some()
        || style.text_width.is_some()
        || style.inner_xsep.is_some()
        || style.inner_ysep.is_some()
        || style.outer_sep.is_some()
        || style.font_size.is_some()
        || style.align.is_some()
        || style.anchor.is_some()
        || style.rotate.is_some()
        || style.sloped
        || style.shape.is_some()
}

fn is_node_position_option(option: &str) -> bool {
    let direction = option
        .split_once('=')
        .map(|(direction, _)| direction.trim())
        .unwrap_or(option);
    matches!(
        direction,
        "above"
            | "below"
            | "left"
            | "right"
            | "above left"
            | "left above"
            | "above right"
            | "right above"
            | "below left"
            | "left below"
            | "below right"
            | "right below"
    ) || assignment_value(option, "xshift").is_some()
        || assignment_value(option, "yshift").is_some()
}

fn parse_node_anchor(value: &str) -> Result<NodeAnchor, String> {
    match value.trim() {
        "center" => Ok(NodeAnchor::Center),
        "north" => Ok(NodeAnchor::North),
        "south" => Ok(NodeAnchor::South),
        "east" => Ok(NodeAnchor::East),
        "west" => Ok(NodeAnchor::West),
        "north east" => Ok(NodeAnchor::NorthEast),
        "north west" => Ok(NodeAnchor::NorthWest),
        "south east" => Ok(NodeAnchor::SouthEast),
        "south west" => Ok(NodeAnchor::SouthWest),
        value => Err(format!(
            "This fast WASM core does not support the node anchor yet: {value}"
        )),
    }
}

fn node_anchor_name(anchor: NodeAnchor) -> &'static str {
    match anchor {
        NodeAnchor::Center => "center",
        NodeAnchor::North => "north",
        NodeAnchor::South => "south",
        NodeAnchor::East => "east",
        NodeAnchor::West => "west",
        NodeAnchor::NorthEast => "north-east",
        NodeAnchor::NorthWest => "north-west",
        NodeAnchor::SouthEast => "south-east",
        NodeAnchor::SouthWest => "south-west",
    }
}

fn apply_explicit_node_anchor(point: &mut Point, anchor: NodeAnchor, width: f64, height: f64) {
    match anchor {
        NodeAnchor::Center => {}
        NodeAnchor::North => point.y -= height / 2.0,
        NodeAnchor::South => point.y += height / 2.0,
        NodeAnchor::East => point.x -= width / 2.0,
        NodeAnchor::West => point.x += width / 2.0,
        NodeAnchor::NorthEast => {
            point.x -= width / 2.0;
            point.y -= height / 2.0;
        }
        NodeAnchor::NorthWest => {
            point.x += width / 2.0;
            point.y -= height / 2.0;
        }
        NodeAnchor::SouthEast => {
            point.x -= width / 2.0;
            point.y += height / 2.0;
        }
        NodeAnchor::SouthWest => {
            point.x += width / 2.0;
            point.y += height / 2.0;
        }
    }
}

fn estimate_node_text(
    text: &str,
    text_width: Option<f64>,
    font_size: f64,
    bold: bool,
) -> (f64, usize) {
    let explicit_lines = text.lines().collect::<Vec<_>>();
    if let Some(limit) = text_width {
        let mut line_count = 0usize;
        for line in explicit_lines {
            let mut current_width = 0.0;
            let mut wrapped_lines = 1usize;
            for word in line.split_whitespace() {
                let word_width = estimate_text_line_width(word, font_size, bold);
                let separator = if current_width > 0.0 {
                    0.25 * font_size
                } else {
                    0.0
                };
                if current_width > 0.0 && current_width + separator + word_width > limit {
                    wrapped_lines += 1;
                    current_width = word_width;
                } else {
                    current_width += separator + word_width;
                }
            }
            line_count += wrapped_lines;
        }
        return (limit, line_count.max(1));
    }
    (
        explicit_lines
            .iter()
            .map(|line| estimate_text_line_width(line, font_size, bold))
            .fold(font_size * 0.5, f64::max),
        explicit_lines.len().max(1),
    )
}

fn estimate_text_line_width(text: &str, font_size: f64, bold: bool) -> f64 {
    let em = text
        .chars()
        .filter(|character| !matches!(*character, '\u{20d7}' | '_' | '^'))
        .map(|character| match character {
            ' ' => 0.25,
            'i' | 'j' | 'l' | 'I' | '!' | '|' | '.' | ',' | ':' | ';' | '\'' => 0.28,
            'f' | 'r' | 't' | '(' | ')' | '[' | ']' => 0.38,
            'm' | 'w' | 'M' | 'W' | '@' => 0.82,
            'A'..='Z' => 0.66,
            '0'..='9' => 0.5,
            character if character.is_ascii() => 0.48,
            _ => 1.0,
        })
        .sum::<f64>();
    em * font_size * if bold { 1.02 } else { 1.0 }
}

#[cfg(test)]
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

fn split_scoped_commands(source: &str) -> Result<Vec<ScopedCommand<'_>>, String> {
    let mut commands = Vec::new();
    let mut start = 0usize;
    let mut brace_depth = 0usize;
    let mut shifts = vec![Point { x: 0.0, y: 0.0 }];
    let mut cursor = 0usize;
    while cursor < source.len() {
        let rest = &source[cursor..];
        if brace_depth == 0
            && let Some(consumed) = scope_boundary_length(rest, "\\begin")
        {
            if !source[start..cursor].trim().is_empty() {
                return Err("A scope must begin between complete TikZ commands.".to_owned());
            }
            let after_boundary = &rest[consumed..];
            let leading = after_boundary.len() - after_boundary.trim_start().len();
            let options_source = &after_boundary[leading..];
            let (options, options_consumed) = if options_source.starts_with('[') {
                let end = options_source
                    .find(']')
                    .ok_or_else(|| "TikZ scope options are missing ']'.".to_owned())?;
                (&options_source[1..end], end + 1)
            } else {
                ("", 0)
            };
            let local = parse_scope_shift(options)?;
            let parent = *shifts
                .last()
                .ok_or_else(|| "TikZ scope stack is empty.".to_owned())?;
            let combined = Point {
                x: parent.x + local.x,
                y: parent.y + local.y,
            };
            validate_scope_shift(combined)?;
            shifts.push(combined);
            cursor += consumed + leading + options_consumed;
            start = cursor;
            continue;
        }
        if brace_depth == 0
            && let Some(consumed) = scope_boundary_length(rest, "\\end")
        {
            if !source[start..cursor].trim().is_empty() {
                return Err("A scope must end between complete TikZ commands.".to_owned());
            }
            if shifts.len() == 1 {
                return Err("A TikZ scope ended without a matching begin.".to_owned());
            }
            shifts.pop();
            cursor += consumed;
            start = cursor;
            continue;
        }
        let character = rest
            .chars()
            .next()
            .ok_or_else(|| "Could not split TikZ commands.".to_owned())?;
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            ';' if brace_depth == 0 => {
                let command = source[start..cursor].trim();
                if !command.is_empty() {
                    commands.push(ScopedCommand {
                        source: command,
                        shift: *shifts
                            .last()
                            .ok_or_else(|| "TikZ scope stack is empty.".to_owned())?,
                    });
                }
                start = cursor + character.len_utf8();
            }
            _ => {}
        }
        cursor += character.len_utf8();
    }
    if shifts.len() != 1 {
        return Err("A TikZ scope is missing \\end{scope}.".to_owned());
    }
    if !source[start..].trim().is_empty() {
        commands.push(ScopedCommand {
            source: source[start..].trim(),
            shift: shifts[0],
        });
    }
    Ok(commands)
}

fn scope_boundary_length(source: &str, prefix: &str) -> Option<usize> {
    if !source.starts_with(prefix) {
        return None;
    }
    let mut cursor = prefix.len();
    cursor += source[cursor..].len() - source[cursor..].trim_start().len();
    if source.as_bytes().get(cursor) != Some(&b'{') {
        return None;
    }
    cursor += 1;
    cursor += source[cursor..].len() - source[cursor..].trim_start().len();
    if !source[cursor..].starts_with("scope") {
        return None;
    }
    cursor += "scope".len();
    cursor += source[cursor..].len() - source[cursor..].trim_start().len();
    (source.as_bytes().get(cursor) == Some(&b'}')).then_some(cursor + 1)
}

fn parse_scope_shift(options: &str) -> Result<Point, String> {
    let options = split_top_level_commas(options)
        .into_iter()
        .map(str::trim)
        .filter(|option| !option.is_empty())
        .collect::<Vec<_>>();
    if options.is_empty() {
        return Ok(Point { x: 0.0, y: 0.0 });
    }
    if options.len() != 1 {
        return Err("The fast WASM core only supports shift in scope options.".to_owned());
    }
    let value = assignment_value(options[0], "shift")
        .ok_or_else(|| "The fast WASM core only supports shift in scope options.".to_owned())?
        .trim();
    let value = value
        .strip_prefix('{')
        .and_then(|value| value.strip_suffix('}'))
        .unwrap_or(value)
        .trim();
    let value = value
        .strip_prefix('(')
        .and_then(|value| value.strip_suffix(')'))
        .ok_or_else(|| "A scope shift needs {(x,y)}.".to_owned())?;
    let shift = parse_coordinate(value)?;
    validate_scope_shift(shift)?;
    Ok(shift)
}

fn validate_scope_shift(shift: Point) -> Result<(), String> {
    if !shift.x.is_finite()
        || !shift.y.is_finite()
        || shift.x.abs() > MAX_SCOPE_SHIFT
        || shift.y.abs() > MAX_SCOPE_SHIFT
    {
        return Err("A TikZ scope shift must be finite and at most 1000 cm.".to_owned());
    }
    Ok(())
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
            if characters.get(index) == Some(&'[') {
                while index < characters.len() && characters[index] != ']' {
                    index += 1;
                }
                if index < characters.len() {
                    index += 1;
                }
            }
            continue;
        }

        index += 1;
        if characters.get(index).is_some_and(|value| value.is_whitespace()) {
            output.push(' ');
            index += 1;
            continue;
        }
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
                | "textbf"
                | "textit"
                | "pu"
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
            "rightarrow" | "longrightarrow" => Some('\u{2192}'),
            "leftarrow" | "longleftarrow" => Some('\u{2190}'),
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
        assert!(svg.contains("r=\"28.346\""));
        assert!(svg.contains("width=\"109.039\" height=\"109.039\""));
    }

    #[test]
    fn measures_math_font_wrappers_by_their_visible_arguments() {
        let fallback = latex_text_to_unicode(r"$\boldsymbol{F}_{\mathrm{e}}$");
        assert_eq!(fallback, "F_e");
        assert_eq!(visible_character_count(&fallback), 2);
        assert_eq!(
            latex_text_to_unicode(
                r"electromagnetic waves $\longrightarrow$ quantized charge"
            ),
            "electromagnetic waves \u{2192} quantized charge",
        );

        let svg = render_svg(
            r"\draw (0,0) -- (0,1);
              \node[right] at (0,0.5) {$\boldsymbol{F}_{\mathrm{e}}$};",
        )
        .unwrap();
        assert!(svg.contains("data-chord-placement=\"right\""));
        assert!(svg.contains("data-chord-anchor-x=\"0.000\""));
    }

    #[test]
    fn renders_stealth_shorthand_and_preserves_physical_unit_math() {
        let svg = render_svg(
            r"\draw[-Stealth] (0,0)--(1,0);
              \draw[Stealth-] (0,1)--(1,1);
              \draw[Stealth-Stealth] (0,2)--(1,2);
              \node at (0,3) {$\pu{5 m.s-1}$};",
        )
        .unwrap();
        assert_eq!(svg.matches("data-chord-arrowhead=\"true\"").count(), 4);
        assert!(svg.contains("data-chord-math=\"\\pu{5 m.s-1}\""));
        assert!(svg.contains(">5 m.s-1</text>"));
    }

    #[test]
    fn exposes_formula_background_padding_for_mathjax_layout() {
        let svg = render_svg(
            r"\node[fill=white, inner sep=1pt] at (0,0) {$A_2$};",
        )
        .unwrap();
        assert!(svg.contains("data-chord-node-background=\"true\""));
        assert!(svg.contains("data-chord-background=\"true\""));
        assert!(svg.contains("data-chord-padding=\"0.996\""));
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
        assert_eq!(svg.matches("data-chord-arrowhead=\"true\"").count(), 2);
        assert!(!svg.contains("<marker"));
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
        assert!(svg.contains("<path d=\"M 12.118,80.787 C "));
        assert_eq!(svg.matches("<polyline").count(), 0);
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
        assert!(svg.contains("r=\"77.940\""));
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
        assert!(svg.contains("L -73."));
        assert!(svg.contains("L 96."));
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
        assert!(svg.contains("rx=\"4.000\" ry=\"4.000\""));
        assert_eq!(svg.matches("<tspan").count(), 2);
        assert!(svg.contains(">现象</text>"));
    }

    #[test]
    fn renders_publication_timeline_node_styles_and_anchors() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
              x=1cm,
              y=1cm,
              >=stealth,
              line cap=round,
              line join=round,
              every node/.style={font=\normalsize,outer sep=0pt},
              year/.style={
                draw,rounded corners=3pt,fill=gray!10,align=center,
                font=\bfseries\normalsize,minimum width=2.25cm,
                minimum height=0.84cm,inner xsep=6pt,inner ysep=3pt
              },
              event/.style={
                draw,rounded corners=4pt,align=left,text width=5.75cm,
                inner xsep=8pt,inner ysep=6pt
              },
              timeline/.style={very thick,->,shorten >=1pt,shorten <=1pt}
            ]
              \node[font=\bfseries\Large,anchor=south] at (0,1.95)
                {Part I: From electrostatic effects to electric current};
              \node[year] (y1) at (-0.70,-0.55) {c.\ 600 BCE};
              \node[year] (y2) at (0.70,-3.45) {1600};
              \draw[timeline] (y1.south)--(y2.north);
              \node[event,anchor=east] (e1) at (-2.05,-0.55)
                {\textbf{Early electrostatic observation}\\[-1pt]
                 Rubbing \textbf{amber} causes it to attract small, light objects.\\[2pt]
                 \textit{Electricity first appears as an observed static effect.}};
              \draw[thick] (e1.east)--(y1.west);
            \end{tikzpicture}",
        )
        .unwrap();

        assert_eq!(svg.matches("<rect").count(), 3);
        assert!(svg.contains("data-chord-text-width=\"162.992\""));
        assert!(svg.contains("data-chord-align=\"left\""));
        assert!(svg.contains("data-chord-min-width=\"63.780\""));
        assert!(svg.contains("data-chord-min-height=\"23.811\""));
        assert!(svg.contains("data-chord-font-weight=\"700\""));
        assert!(svg.contains("rx=\"2.989\" ry=\"2.989\""));
        assert!(svg.contains("stroke-width=\"1.196\""));
        assert!(svg.contains("data-chord-shorten-start=\"0.996\""));
        assert!(svg.contains("data-chord-shorten-end=\"0.996\""));
        assert!(svg.contains("data-chord-arrowhead=\"true\""));
        assert!(svg.contains("Early electrostatic observation"));
    }

    #[test]
    fn renders_rotated_plate_labels_and_curved_field_arrows() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
              scale=1.0,>=stealth,line cap=round,line join=round,
              every node/.style={font=\small}
            ]
              \draw[thick,fill=gray!8]
                (-2.15,-2.05) rectangle (-1.90,2.05);
              \draw[->,thick]
                (-1.78,1.48)
                .. controls (-0.95,1.82) and (0.95,1.82) ..
                (1.78,1.48);
              \node[rotate=90] at (-2.55,0) {positive plate};
            \end{tikzpicture}",
        )
        .unwrap();

        assert!(svg.contains("<rect"));
        assert!(svg.contains("data-chord-arrowhead=\"true\""));
        assert!(svg.contains("data-chord-rotate=\"90.000\""));
        assert!(svg.contains("transform=\"rotate(-90.000"));
    }

    #[test]
    fn renders_bounded_smooth_coordinate_field_lines() {
        let svg = render_svg(
            r"\begin{tikzpicture}[x=1cm,y=1cm,scale=1.0]
              \draw[thick]
              plot[smooth] coordinates {
                (-2.10,0.58) (-2.90,0.78) (-2.70,1.95) (0,2.55)
                (2.70,1.95) (2.90,0.78) (2.10,0.58)
              };
              \draw[->,thick] (-0.30,2.55)--(0.30,2.55);
            \end{tikzpicture}",
        )
        .unwrap();

        assert_eq!(svg.matches(" C ").count(), 6);
        assert!(svg.contains(
            "M -59.528,-16.441 C -59.528,-16.441"
        ));
        assert!(svg.contains("59.528,-16.441 59.528,-16.441"));
        assert!(svg.contains("data-chord-arrowhead=\"true\""));
        assert_eq!(svg.matches("<polyline").count(), 1);
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
        assert_eq!(svg.matches("data-chord-arrowhead=\"true\"").count(), 4);
        assert!(svg.contains("stroke-width=\"0.797\""));
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
        let error = render_svg(r"\draw[double] (0,0) -- (1,1);").unwrap_err();
        assert!(error.contains("path option"));
    }

    #[test]
    fn rejects_unknown_picture_options_instead_of_drifting_from_tex() {
        let error = render_svg(
            r"\begin{tikzpicture}[transform shape]
                \draw (0,0) -- (1,1);
              \end{tikzpicture}",
        )
        .unwrap_err();
        assert!(error.contains("picture option"));
    }

    #[test]
    fn rejects_invalid_node_shifts_instead_of_ignoring_them() {
        let error = render_svg(r"\node[xshift=far] at (0,0) {text};").unwrap_err();
        assert!(error.contains("Invalid TikZ"));
    }

    #[test]
    fn rejects_plot_options_and_sample_counts_outside_the_contract() {
        let option_error = render_svg(
            r"\draw plot[domain=0:1,variable=\t] ({\t},{\t});",
        )
        .unwrap_err();
        assert!(option_error.contains("plot option"));

        let sample_error = render_svg(
            r"\draw plot[domain=0:1,samples=300] ({\x},{\x});",
        )
        .unwrap_err();
        assert!(sample_error.contains("between 2 and 256"));
    }

    #[test]
    fn accepts_tex_style_spacing_around_supported_assignments() {
        let svg = render_svg(
            r"\begin{tikzpicture}[scale = 1.0, x = 1cm, >= stealth]
                \node[draw, minimum width = 2cm, xshift = 3pt] at (0,0) {text};
                \draw[draw = red, shorten >= 1pt] (0,0)--(2,0);
              \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("<rect"));
        assert!(svg.contains("stroke=\"red\""));
    }

    #[test]
    fn applies_picture_level_line_weights_and_standard_arrow_tips() {
        let svg = render_svg(
            r"\begin{tikzpicture}[very thick]
                \draw (0,0)--(1,0);
              \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("stroke-width=\"1.196\""));

        let latex = render_svg(
            r"\begin{tikzpicture}[>=latex]
                \draw[->] (0,0)--(1,0);
              \end{tikzpicture}",
        )
        .unwrap();
        assert!(latex.contains("data-chord-arrowhead=\"true\""));

        let error = render_svg(
            r"\begin{tikzpicture}[>=Triangle]
                \draw[->] (0,0)--(1,0);
              \end{tikzpicture}",
        )
        .unwrap_err();
        assert!(error.contains("picture option"));
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
        assert_eq!(svg.matches("data-chord-arrowhead=\"true\"").count(), 8);
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
        assert!(svg.contains("font-size=\"14.346\""));
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
        assert!(svg.contains("stroke-width=\"1.196\""));
        assert!(svg.contains("data-chord-arrowhead=\"true\""));
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
        assert_eq!(svg.matches("data-chord-arrowhead=\"true\"").count(), 4);
        assert!(!svg.contains("<marker"));
        assert!(svg.contains("fill=\"currentColor\" fill-opacity=\"1.000\""));
    }

    #[test]
    fn renders_coordinate_graph_labels_ticks_and_smooth_curve() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
                x=1cm, y=1cm, >=stealth,
                every node/.style={font=\small},
                line cap=round
              ]
              \draw[->, thick] (0,0)--(8.65,0)
                node[right] {$r/\mathrm{m}$};
              \draw[->, thick] (0,0)--(0,6.75)
                node[above] {$V_{\mathrm e}/\mathrm{V}$};
              \foreach \x/\lab in {2/0.10,4/0.20,6/0.30,8/0.40}{
                \draw (\x,0.08)--(\x,-0.08);
                \node[below=3pt] at (\x,0) {\lab};
                \draw[gray!35] (\x,0)--(\x,6.15);
              }
              \draw[densely dotted, thick] (2,0)--(2,6.25);
              \draw[thick, smooth] plot coordinates {
                (2,6) (2.4,5) (3,4) (4,3) (5,2.4) (6,2)
              };
              \node[above right=2pt] at (4,3) {P};
            \end{tikzpicture}",
        )
        .unwrap();
        assert_eq!(svg.matches("data-chord-math=").count(), 2);
        assert_eq!(svg.matches("data-chord-text=").count(), 5);
        assert_eq!(svg.matches("stroke-opacity=\"0.350\"").count(), 4);
        assert!(svg.contains("stroke-dasharray=\"0.01 1.993\""));
        assert!(svg.contains(" C "));
        assert!(svg.contains("data-chord-placement=\"below\""));
        assert!(svg.contains("data-chord-gap=\"3.487\""));
        assert!(svg.contains("data-chord-placement=\"above-right\""));
        assert!(svg.contains("data-chord-gap=\"2.491\""));
    }

    #[test]
    fn renders_stem_grid_closed_geometry_and_classic_arcs() {
        let svg = render_svg(
            r"\begin{tikzpicture}[>=Latex]
              \draw[help lines,step=0.5cm] (0,0) grid (2,1);
              \filldraw[fill=cyan!20,draw=blue,fill opacity=0.6]
                (0,0)--(2,0)--(1,1)--cycle;
              \draw[orange,line width=1pt,densely dashed,draw opacity=0.8]
                (0,0)--(2,1);
              \draw[-{Stealth},semithick] (1,0) arc (0:120:1);
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("M 0.000,-0.000 L 0.000,-28.346"));
        assert!(svg.contains("<polygon"));
        assert!(svg.contains("fill-opacity=\"0.120\""));
        assert!(svg.contains("stroke=\"orange\""));
        assert!(svg.contains("stroke-width=\"0.996\""));
        assert!(svg.contains("stroke-dasharray=\"5 2\""));
        assert!(svg.contains("stroke-opacity=\"0.800\""));
        assert!(svg.contains(" A "));
        assert!(svg.contains("data-chord-arrowhead=\"true\""));
    }

    #[test]
    fn renders_polar_relative_and_named_coordinates() {
        let svg = render_svg(
            r"\begin{tikzpicture}
              \coordinate (O) at (0,0);
              \coordinate (P) at (3,2);
              \draw[->] (O)--(P);
              \draw[->] (0,0)--(30:2);
              \draw[->] (0,0)--++(1,-2);
              \draw (0,-1)--node[midway,above] {$v$} (4,-1);
              \draw (0,-2)--(4,-2) node[pos=0.75,below] {distance};
              \node[above] at (P) {$P$};
              \node[circle,draw,minimum width=1cm] (q1) at (0,-4) {$q_1$};
              \node[circle,draw,minimum width=1cm] (q2) at (3,-4) {$q_2$};
              \draw[->] (q1)--(q2);
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("85.039,-56.693"));
        assert!(svg.contains("49.098,-28.346"));
        assert!(svg.contains("28.346,56.693"));
        assert_eq!(svg.matches("data-chord-arrowhead=\"true\"").count(), 4);
        assert!(svg.contains("data-chord-math=\"P\""));
        assert!(svg.contains("data-chord-math=\"v\""));
        assert!(svg.contains("data-chord-text=\"distance\""));
        assert!(svg.contains("data-chord-anchor-x=\"56.693\""), "{svg}");
        assert!(svg.contains("data-chord-anchor-x=\"85.039\""));
        assert_eq!(
            svg.matches("<circle data-chord-node-background=\"true\"").count(),
            2
        );
    }

    #[test]
    fn rejects_unbounded_grids_before_integer_conversion() {
        let error = render_svg(
            r"\begin{tikzpicture}
              \draw[step=0.000000000000000000000000000001cm] (0,0) grid (1,1);
            \end{tikzpicture}",
        )
        .unwrap_err();
        assert!(error.contains("1024-line safety limit"));
    }

    #[test]
    fn does_not_confuse_a_coordinate_named_grid_with_the_grid_operator() {
        let svg = render_svg(
            r"\begin{tikzpicture}
              \coordinate (grid) at (0,0);
              \coordinate (P) at (2,1);
              \draw (grid)--(P);
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("<polyline"));
        assert!(!svg.contains(" L 0.000,-28.346 M "));
    }

    #[test]
    fn circular_nodes_circumscribe_their_rectangular_content_box() {
        let svg = render_svg(
            r"\begin{tikzpicture}
              \node[circle,draw,minimum width=3cm,minimum height=4cm] at (0,0) {};
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("r=\"70.866\""), "{svg}");
    }

    #[test]
    fn renders_upright_sloped_labels_on_straight_named_node_connectors() {
        let svg = render_svg(
            r"\begin{tikzpicture}[
              >=stealth,
              thick,
              every node/.style={font=\small},
              box/.style={
                draw,rounded corners,align=center,
                minimum width=3.25cm,minimum height=1cm
              }
            ]
              \node[box] (field) at (6,-0.4) {electric field};
              \node[box] (V) at (1.2,-3.4) {electric potential\\$V_{\mathrm e}$};
              \node[box] (E) at (10.8,-3.4)
                {electric field strength\\$\boldsymbol{E}$};
              \draw[->] (field)--node[above,sloped,midway]
                {scalar description}(V);
              \draw[->] (field)--node[above,sloped,midway]
                {vector description}(E);
            \end{tikzpicture}",
        )
        .unwrap();
        assert_eq!(svg.matches("data-chord-sloped=\"true\"").count(), 2);
        assert!(svg.contains("data-chord-rotate=\"32.005\""), "{svg}");
        assert!(svg.contains("data-chord-rotate=\"-32.005\""), "{svg}");
    }

    #[test]
    fn renders_translated_foreach_conductor_scopes() {
        let svg = render_svg(
            r"\begin{tikzpicture}[>=stealth,thick,every node/.style={font=\small}]
              \begin{scope}[shift={(0,0)}]
                \draw[fill=gray!6] (0,0) circle (1.2);
                \foreach \ang in {0,30,...,330}{
                  \node at ({1.2*cos(\ang)},{1.2*sin(\ang)}) {$+$};
                  \draw[->] ({1.2*cos(\ang)},{1.2*sin(\ang)})
                    -- ({2.45*cos(\ang)},{2.45*sin(\ang)});
                }
              \end{scope}
              \begin{scope}[shift={(6.5,0)}]
                \draw[fill=gray!6] (0,0) circle (1.2);
                \foreach \ang in {0,30,...,330}{
                  \node at ({1.2*cos(\ang)},{1.2*sin(\ang)}) {$-$};
                  \draw[<-] ({1.2*cos(\ang)},{1.2*sin(\ang)})
                    -- ({2.45*cos(\ang)},{2.45*sin(\ang)});
                }
              \end{scope}
            \end{tikzpicture}",
        )
        .unwrap();
        assert_eq!(svg.matches("data-chord-arrowhead=\"true\"").count(), 24);
        assert!(svg.contains("cx=\"0.000\""), "{svg}");
        assert!(svg.contains("cx=\"184.252\""), "{svg}");
    }

    #[test]
    fn applies_scope_shift_once_to_inline_labels_and_supported_plots() {
        let svg = render_svg(
            r"\begin{tikzpicture}
              \begin{scope}[shift={(2,3)}]
                \draw (0,0)--node[midway,above] {label}(2,0);
                \draw plot[domain=0:1,samples=2] ({\x},{\x});
                \draw[smooth] plot coordinates {(0,0) (1,1) (2,0)};
              \end{scope}
            \end{tikzpicture}",
        )
        .unwrap();
        assert!(svg.contains("data-chord-x=\"85.039\""), "{svg}");
        assert!(svg.contains("M 56.693,-85.039"), "{svg}");
    }

    #[test]
    fn rejects_unbounded_and_accumulated_scope_shifts() {
        for source in [
            r"\begin{scope}[shift={(1001,0)}]\draw (0,0)--(1,0);\end{scope}",
            r"\begin{scope}[shift={(600,0)}]
                \begin{scope}[shift={(600,0)}]
                  \draw (0,0)--(1,0);
                \end{scope}
              \end{scope}",
        ] {
            let error = render_svg(source).unwrap_err();
            assert!(error.contains("at most 1000 cm"), "{error}");
        }
    }
}
