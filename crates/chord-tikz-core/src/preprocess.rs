use std::collections::BTreeMap;

const MAX_EXPANDED_BYTES: usize = 128 * 1024;
const MAX_EXPANSION_DEPTH: usize = 8;
const MAX_FOREACH_ITEMS: usize = 256;

pub(crate) fn preprocess(source: &str) -> Result<String, String> {
    expand_program(source, &mut BTreeMap::new(), 0)
}

pub(crate) fn evaluate_numeric_expression(source: &str) -> Result<f64, String> {
    ExpressionParser::new(source).parse()
}

fn expand_program(
    source: &str,
    macros: &mut BTreeMap<String, String>,
    depth: usize,
) -> Result<String, String> {
    if depth > MAX_EXPANSION_DEPTH {
        return Err("TikZ macro expansion exceeded the safety depth.".to_owned());
    }

    let mut output = String::with_capacity(source.len());
    let mut cursor = 0usize;
    while cursor < source.len() {
        let rest = &source[cursor..];
        if rest.starts_with("\\def") && command_boundary(rest, "\\def".len()) {
            cursor += parse_definition(rest, macros)?;
            continue;
        }
        if rest.starts_with("\\pgfmathsetmacro")
            && command_boundary(rest, "\\pgfmathsetmacro".len())
        {
            cursor += parse_math_definition(rest, macros)?;
            continue;
        }
        if rest.starts_with("\\foreach") && command_boundary(rest, "\\foreach".len()) {
            let (expanded, consumed) = expand_foreach(rest, macros, depth)?;
            push_bounded(&mut output, &expanded)?;
            cursor += consumed;
            continue;
        }
        if rest.starts_with('\\') {
            let (name, consumed) = take_control_sequence(rest)?;
            if let Some(value) = macros.get(name) {
                push_bounded(&mut output, value)?;
                cursor += consumed;
                continue;
            }
        }

        let character = rest
            .chars()
            .next()
            .ok_or_else(|| "Could not read TikZ source.".to_owned())?;
        output.push(character);
        cursor += character.len_utf8();
        ensure_bounded(&output)?;
    }
    Ok(output)
}

fn parse_definition(
    source: &str,
    macros: &mut BTreeMap<String, String>,
) -> Result<usize, String> {
    let mut cursor = "\\def".len();
    cursor = skip_whitespace(source, cursor);
    let (name, consumed) = take_control_sequence(&source[cursor..])?;
    if name == "\\" {
        return Err("A \\def command needs a control-sequence name.".to_owned());
    }
    cursor += consumed;
    cursor = skip_whitespace(source, cursor);
    let (value, consumed) = take_group(source, cursor)?;
    let expanded = expand_macros(value, macros)?;
    macros.insert(name.to_owned(), expanded);
    Ok(cursor + consumed)
}

fn parse_math_definition(
    source: &str,
    macros: &mut BTreeMap<String, String>,
) -> Result<usize, String> {
    let mut cursor = "\\pgfmathsetmacro".len();
    cursor = skip_whitespace(source, cursor);
    let (raw_name, consumed) = take_group(source, cursor)?;
    let name = raw_name.trim();
    if !is_control_sequence(name) {
        return Err("\\pgfmathsetmacro needs a braced control-sequence name.".to_owned());
    }
    cursor += consumed;
    cursor = skip_whitespace(source, cursor);
    let (expression, consumed) = take_group(source, cursor)?;
    let expression = expand_macros(expression, macros)?;
    let value = evaluate_numeric_expression(&expression)?;
    if !value.is_finite() {
        return Err("PGF math produced a non-finite value.".to_owned());
    }
    macros.insert(name.to_owned(), format_number(value));
    Ok(cursor + consumed)
}

fn expand_foreach(
    source: &str,
    macros: &BTreeMap<String, String>,
    depth: usize,
) -> Result<(String, usize), String> {
    let mut cursor = "\\foreach".len();
    cursor = skip_whitespace(source, cursor);
    let (variable, consumed) = take_control_sequence(&source[cursor..])?;
    if variable == "\\" {
        return Err("A \\foreach command needs a loop variable.".to_owned());
    }
    cursor += consumed;
    cursor = skip_whitespace(source, cursor);
    if !source[cursor..].starts_with("in")
        || !command_boundary(&source[cursor..], "in".len())
    {
        return Err("A \\foreach command needs 'in' before its values.".to_owned());
    }
    cursor += "in".len();
    cursor = skip_whitespace(source, cursor);
    let (raw_values, consumed) = take_group(source, cursor)?;
    cursor += consumed;
    cursor = skip_whitespace(source, cursor);
    let (body, consumed) = take_group(source, cursor)?;
    cursor += consumed;

    let values = expand_foreach_values(raw_values, macros)?;
    if values.is_empty() || values.len() > MAX_FOREACH_ITEMS {
        return Err(format!(
            "A \\foreach loop must contain between 1 and {MAX_FOREACH_ITEMS} values."
        ));
    }

    let mut output = String::new();
    for value in values {
        let mut local_macros = macros.clone();
        local_macros.insert(variable.to_owned(), value);
        let expanded = expand_program(body, &mut local_macros, depth + 1)?;
        push_bounded(&mut output, &expanded)?;
    }
    Ok((output, cursor))
}

fn expand_foreach_values(
    source: &str,
    macros: &BTreeMap<String, String>,
) -> Result<Vec<String>, String> {
    let raw_values = split_top_level(source, ',');
    let mut values = raw_values
        .iter()
        .map(|value| expand_macros(value.trim(), macros))
        .collect::<Result<Vec<_>, _>>()?;
    let Some(ellipsis) = values.iter().position(|value| value.trim() == "...") else {
        return Ok(values);
    };
    if values.iter().filter(|value| value.trim() == "...").count() != 1
        || !matches!(ellipsis, 1 | 2)
        || ellipsis + 1 != values.len() - 1
    {
        return Err(
            "The lightweight \\foreach range supports {start,...,end} or {start,next,...,end}."
                .to_owned(),
        );
    }

    let start = evaluate_numeric_expression(values[0].trim())?;
    let end = evaluate_numeric_expression(values[ellipsis + 1].trim())?;
    let step = if ellipsis == 2 {
        evaluate_numeric_expression(values[1].trim())? - start
    } else if end >= start {
        1.0
    } else {
        -1.0
    };
    if !start.is_finite() || !end.is_finite() || !step.is_finite() || step == 0.0 {
        return Err("A \\foreach range needs finite values and a non-zero step.".to_owned());
    }
    if (end - start).signum() != step.signum() && (end - start).abs() > f64::EPSILON {
        return Err("A \\foreach range step moves away from its end value.".to_owned());
    }

    values.clear();
    let tolerance = step.abs() * 1e-9 + 1e-12;
    let mut current = start;
    while if step > 0.0 {
        current <= end + tolerance
    } else {
        current >= end - tolerance
    } {
        if values.len() >= MAX_FOREACH_ITEMS {
            return Err(format!(
                "A \\foreach range exceeds the {MAX_FOREACH_ITEMS}-item safety limit."
            ));
        }
        values.push(format_number(current));
        current += step;
    }
    Ok(values)
}

fn expand_macros(
    source: &str,
    macros: &BTreeMap<String, String>,
) -> Result<String, String> {
    let mut output = String::with_capacity(source.len());
    let mut cursor = 0usize;
    while cursor < source.len() {
        let rest = &source[cursor..];
        if rest.starts_with('\\') {
            let (name, consumed) = take_control_sequence(rest)?;
            if let Some(value) = macros.get(name) {
                push_bounded(&mut output, value)?;
                cursor += consumed;
                continue;
            }
        }
        let character = rest
            .chars()
            .next()
            .ok_or_else(|| "Could not expand TikZ macros.".to_owned())?;
        output.push(character);
        cursor += character.len_utf8();
        ensure_bounded(&output)?;
    }
    Ok(output)
}

fn take_control_sequence(source: &str) -> Result<(&str, usize), String> {
    if !source.starts_with('\\') {
        return Err("Expected a TeX control sequence.".to_owned());
    }
    let mut end = 1usize;
    for (index, character) in source[1..].char_indices() {
        if !character.is_ascii_alphabetic() && character != '@' {
            break;
        }
        end = 1 + index + character.len_utf8();
    }
    if end == 1 {
        let character = source[1..]
            .chars()
            .next()
            .ok_or_else(|| "A TeX control sequence is incomplete.".to_owned())?;
        end += character.len_utf8();
    }
    Ok((&source[..end], end))
}

fn take_group(source: &str, start: usize) -> Result<(&str, usize), String> {
    if source.as_bytes().get(start) != Some(&b'{') {
        return Err("Expected a braced TeX group.".to_owned());
    }
    let mut depth = 0usize;
    for (relative, character) in source[start..].char_indices() {
        match character {
            '{' => depth += 1,
            '}' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    let end = start + relative;
                    return Ok((&source[start + 1..end], relative + 1));
                }
            }
            _ => {}
        }
    }
    Err("A TeX group is missing '}'.".to_owned())
}

fn split_top_level(source: &str, separator: char) -> Vec<&str> {
    let mut values = Vec::new();
    let mut start = 0usize;
    let mut brace_depth = 0usize;
    let mut parenthesis_depth = 0usize;
    for (index, character) in source.char_indices() {
        match character {
            '{' => brace_depth += 1,
            '}' => brace_depth = brace_depth.saturating_sub(1),
            '(' => parenthesis_depth += 1,
            ')' => parenthesis_depth = parenthesis_depth.saturating_sub(1),
            value
                if value == separator
                    && brace_depth == 0
                    && parenthesis_depth == 0 =>
            {
                values.push(&source[start..index]);
                start = index + value.len_utf8();
            }
            _ => {}
        }
    }
    values.push(&source[start..]);
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty())
        .collect()
}

fn command_boundary(source: &str, end: usize) -> bool {
    source[end..]
        .chars()
        .next()
        .is_none_or(|character| !character.is_ascii_alphabetic() && character != '@')
}

fn is_control_sequence(value: &str) -> bool {
    if !value.starts_with('\\') {
        return false;
    }
    take_control_sequence(value)
        .map(|(_, consumed)| consumed == value.len())
        .unwrap_or(false)
}

fn skip_whitespace(source: &str, mut cursor: usize) -> usize {
    while let Some(character) = source[cursor..].chars().next() {
        if !character.is_whitespace() {
            break;
        }
        cursor += character.len_utf8();
    }
    cursor
}

fn push_bounded(output: &mut String, value: &str) -> Result<(), String> {
    output.push_str(value);
    ensure_bounded(output)
}

fn ensure_bounded(output: &str) -> Result<(), String> {
    if output.len() > MAX_EXPANDED_BYTES {
        Err("Expanded TikZ source exceeds the 128 KiB safety limit.".to_owned())
    } else {
        Ok(())
    }
}

fn format_number(value: f64) -> String {
    let mut formatted = format!("{value:.12}");
    while formatted.contains('.') && formatted.ends_with('0') {
        formatted.pop();
    }
    if formatted.ends_with('.') {
        formatted.pop();
    }
    if formatted == "-0" {
        "0".to_owned()
    } else {
        formatted
    }
}

struct ExpressionParser<'a> {
    source: &'a [u8],
    cursor: usize,
}

impl<'a> ExpressionParser<'a> {
    fn new(source: &'a str) -> Self {
        Self {
            source: source.as_bytes(),
            cursor: 0,
        }
    }

    fn parse(mut self) -> Result<f64, String> {
        let value = self.expression()?;
        self.whitespace();
        if self.cursor != self.source.len() {
            return Err("Unsupported token in PGF math expression.".to_owned());
        }
        Ok(value)
    }

    fn expression(&mut self) -> Result<f64, String> {
        let mut value = self.term()?;
        loop {
            self.whitespace();
            if self.consume(b'+') {
                value += self.term()?;
            } else if self.consume(b'-') {
                value -= self.term()?;
            } else {
                return Ok(value);
            }
        }
    }

    fn term(&mut self) -> Result<f64, String> {
        let mut value = self.power()?;
        loop {
            self.whitespace();
            if self.consume(b'*') {
                value *= self.power()?;
            } else if self.consume(b'/') {
                let divisor = self.power()?;
                if divisor == 0.0 {
                    return Err("Division by zero in PGF math expression.".to_owned());
                }
                value /= divisor;
            } else {
                return Ok(value);
            }
        }
    }

    fn power(&mut self) -> Result<f64, String> {
        let value = self.unary()?;
        self.whitespace();
        if self.consume(b'^') {
            Ok(value.powf(self.power()?))
        } else {
            Ok(value)
        }
    }

    fn unary(&mut self) -> Result<f64, String> {
        self.whitespace();
        if self.consume(b'+') {
            self.unary()
        } else if self.consume(b'-') {
            Ok(-self.unary()?)
        } else {
            self.primary()
        }
    }

    fn primary(&mut self) -> Result<f64, String> {
        self.whitespace();
        if self.consume(b'(') {
            let value = self.expression()?;
            self.whitespace();
            if !self.consume(b')') {
                return Err("PGF math expression is missing ')'.".to_owned());
            }
            return Ok(value);
        }
        if self.peek().is_some_and(|byte| byte.is_ascii_alphabetic()) {
            let name = self.identifier();
            self.whitespace();
            if !self.consume(b'(') {
                return Err(format!("Unsupported PGF math identifier: {name}"));
            }
            let argument = self.expression()?;
            self.whitespace();
            if !self.consume(b')') {
                return Err("PGF math function is missing ')'.".to_owned());
            }
            return match name.as_str() {
                "sqrt" if argument >= 0.0 => Ok(argument.sqrt()),
                "sqrt" => Err("Square root of a negative PGF math value.".to_owned()),
                "abs" => Ok(argument.abs()),
                "sin" => Ok(argument.to_radians().sin()),
                "cos" => Ok(argument.to_radians().cos()),
                "tan" => Ok(argument.to_radians().tan()),
                _ => Err(format!("Unsupported PGF math function: {name}")),
            };
        }
        self.number()
    }

    fn number(&mut self) -> Result<f64, String> {
        self.whitespace();
        let start = self.cursor;
        while self
            .peek()
            .is_some_and(|byte| byte.is_ascii_digit() || byte == b'.')
        {
            self.cursor += 1;
        }
        if start == self.cursor {
            return Err("Expected a number in PGF math expression.".to_owned());
        }
        std::str::from_utf8(&self.source[start..self.cursor])
            .map_err(|_| "PGF math expression is not valid UTF-8.".to_owned())?
            .parse::<f64>()
            .map_err(|_| "Invalid number in PGF math expression.".to_owned())
    }

    fn identifier(&mut self) -> String {
        let start = self.cursor;
        while self.peek().is_some_and(|byte| byte.is_ascii_alphabetic()) {
            self.cursor += 1;
        }
        std::str::from_utf8(&self.source[start..self.cursor])
            .unwrap_or("")
            .to_owned()
    }

    fn whitespace(&mut self) {
        while self.peek().is_some_and(|byte| byte.is_ascii_whitespace()) {
            self.cursor += 1;
        }
    }

    fn consume(&mut self, expected: u8) -> bool {
        if self.peek() == Some(expected) {
            self.cursor += 1;
            true
        } else {
            false
        }
    }

    fn peek(&self) -> Option<u8> {
        self.source.get(self.cursor).copied()
    }
}

#[cfg(test)]
mod tests {
    use super::preprocess;

    #[test]
    fn expands_definitions_and_pgf_math() {
        let expanded = preprocess(
            r"\def\a{3.4}\def\b{2.0}\pgfmathsetmacro{\c}{sqrt(\a*\a-\b*\b)}
              \draw (0,0) circle (\c);",
        )
        .unwrap();
        assert!(expanded.contains(r"\draw (0,0) circle (2.749545416974);"));
        assert!(!expanded.contains(r"\pgfmathsetmacro"));
    }

    #[test]
    fn expands_bounded_foreach_lists() {
        let expanded = preprocess(
            r"\foreach \r in {0.8,1.5,2.3}{\draw[dashed] (0,0) circle (\r);}",
        )
        .unwrap();
        assert_eq!(expanded.matches(r"\draw[dashed]").count(), 3);
        assert!(expanded.contains("circle (0.8)"));
        assert!(expanded.contains("circle (2.3)"));
    }

    #[test]
    fn keeps_loop_definitions_scoped() {
        let expanded = preprocess(
            r"\def\r{4}\foreach \r in {1,2}{\draw (0,0) circle (\r);}\draw (0,0) circle (\r);",
        )
        .unwrap();
        assert!(expanded.ends_with(r"\draw (0,0) circle (4);"));
    }

    #[test]
    fn expands_foreach_ellipsis_ranges() {
        let expanded = preprocess(
            r"\foreach \angle in {0,45,...,315}{
                \draw (0,0) -- ({2.8*cos(\angle)},{2.8*sin(\angle)});
            }",
        )
        .unwrap();
        assert_eq!(expanded.matches(r"\draw").count(), 8);
        assert!(expanded.contains("2.8*cos(0)"));
        assert!(expanded.contains("2.8*cos(315)"));
        assert!(!expanded.contains("cos(...)"));
    }

    #[test]
    fn bounds_foreach_ellipsis_ranges() {
        let error = preprocess(
            r"\foreach \x in {0,...,1000}{\draw (0,0) circle (\x);}",
        )
        .unwrap_err();
        assert!(error.contains("256-item safety limit"));
    }
}
