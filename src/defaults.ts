import type { Shortcut } from "./types";

/**
 * Default math chord shortcuts (leader = Alt+M by default).
 * Core bindings are inspired by LyX math-mode shortcuts; extras use letter prefixes
 * (M/T/W/O/B) to avoid trie conflicts.
 */
export const DEFAULT_SHORTCUTS: Shortcut[] = [
  // Structures
  { keys: "F", command: "\\frac{$$}{}", name: "Fraction", group: "Structures" },
  { keys: "S", command: "\\sqrt{$$}", name: "Square root", group: "Structures" },
  { keys: "Shift+R", command: "\\sqrt[$$]{}", name: "Nth root", group: "Structures" },
  { keys: "^", command: "^{$$}", name: "Superscript", group: "Structures" },
  { keys: "Shift+_", command: "_{$$}", name: "Subscript", group: "Structures" },
  { keys: "D", command: "__DISPLAY_MATH__", name: "Display math", group: "Structures" },

  // Operators & symbols
  { keys: "U", command: "\\sum", name: "Sum", group: "Operators" },
  { keys: "I", command: "\\int", name: "Integral", group: "Operators" },
  { keys: "Shift+I", command: "\\int_{$$}^{}", name: "Integral with limits", group: "Operators" },
  { keys: "Y", command: "\\oint", name: "Contour integral", group: "Operators" },
  { keys: "P", command: "\\partial", name: "Partial", group: "Operators" },
  { keys: "Shift+P", command: "\\prod_{$$}^{}", name: "Product", group: "Operators" },
  { keys: "L", command: "\\lim_{$$}", name: "Limit", group: "Operators" },
  { keys: "8", command: "\\infty", name: "Infinity", group: "Operators" },
  { keys: "'", command: "'", name: "Prime", group: "Operators" },
  { keys: "+", command: "\\pm", name: "Plus-minus", group: "Operators" },
  { keys: "= |", command: "\\neq", name: "Not equal", group: "Operators" },

  // Accents
  { keys: '"', command: "\\ddot{$$}", name: "Double dot", group: "Accents" },
  { keys: "H", command: "\\hat{$$}", name: "Hat", group: "Accents" },
  { keys: "\\", command: "\\grave{$$}", name: "Grave", group: "Accents" },
  { keys: "/", command: "\\acute{$$}", name: "Acute", group: "Accents" },
  { keys: "&", command: "\\tilde{$$}", name: "Tilde", group: "Accents" },
  { keys: "-", command: "\\bar{$$}", name: "Bar", group: "Accents" },
  { keys: ".", command: "\\dot{$$}", name: "Dot", group: "Accents" },
  { keys: "Shift+V", command: "\\breve{$$}", name: "Breve", group: "Accents" },
  { keys: "Shift+U", command: "\\check{$$}", name: "Check", group: "Accents" },
  { keys: "V", command: "\\vec{$$}", name: "Vector", group: "Accents" },
  { keys: "_", command: "\\underline{$$}", name: "Underline", group: "Accents" },
  { keys: "B", command: "\\overline{$$}", name: "Overline", group: "Accents" },

  // Delimiters
  { keys: "(", command: "\\left($$\\right)", name: "Parentheses", group: "Delimiters" },
  { keys: "[", command: "\\left[$$\\right]", name: "Square brackets", group: "Delimiters" },
  { keys: "{", command: "\\left\\{$$\\right\\}", name: "Curly brackets", group: "Delimiters" },
  { keys: "<", command: "\\left\\langle$$\\right\\rangle", name: "Angle brackets", group: "Delimiters" },
  { keys: ">", command: "\\left)$$\\right(", name: "Reverse parentheses", group: "Delimiters" },
  { keys: "|", command: "\\left|$$\\right|", name: "Vertical bars", group: "Delimiters" },

  // Greek (lowercase)
  { keys: "G A", command: "\\alpha", name: "alpha", group: "Greek" },
  { keys: "G B", command: "\\beta", name: "beta", group: "Greek" },
  { keys: "G C", command: "\\chi", name: "chi", group: "Greek" },
  { keys: "G D", command: "\\delta", name: "delta", group: "Greek" },
  { keys: "G E", command: "\\epsilon", name: "epsilon", group: "Greek" },
  { keys: "G F", command: "\\phi", name: "phi", group: "Greek" },
  { keys: "G G", command: "\\gamma", name: "gamma", group: "Greek" },
  { keys: "G H", command: "\\eta", name: "eta", group: "Greek" },
  { keys: "G I", command: "\\iota", name: "iota", group: "Greek" },
  { keys: "G J", command: "\\varphi", name: "varphi", group: "Greek" },
  { keys: "G K", command: "\\kappa", name: "kappa", group: "Greek" },
  { keys: "G L", command: "\\lambda", name: "lambda", group: "Greek" },
  { keys: "G M", command: "\\mu", name: "mu", group: "Greek" },
  { keys: "G N", command: "\\nu", name: "nu", group: "Greek" },
  { keys: "G O", command: "\\omega", name: "omega", group: "Greek" },
  { keys: "G P", command: "\\pi", name: "pi", group: "Greek" },
  { keys: "G Q", command: "\\vartheta", name: "vartheta", group: "Greek" },
  { keys: "G R", command: "\\rho", name: "rho", group: "Greek" },
  { keys: "G S", command: "\\sigma", name: "sigma", group: "Greek" },
  { keys: "G T", command: "\\tau", name: "tau", group: "Greek" },
  { keys: "G U", command: "\\upsilon", name: "upsilon", group: "Greek" },
  { keys: "G V", command: "\\theta", name: "theta", group: "Greek" },
  { keys: "G X", command: "\\xi", name: "xi", group: "Greek" },
  { keys: "G Y", command: "\\psi", name: "psi", group: "Greek" },
  { keys: "G Z", command: "\\zeta", name: "zeta", group: "Greek" },

  // Greek (uppercase & variants)
  { keys: "G Shift+D", command: "\\Delta", name: "Delta", group: "Greek" },
  { keys: "G Shift+E", command: "\\varepsilon", name: "varepsilon", group: "Greek" },
  { keys: "G Shift+F", command: "\\Phi", name: "Phi", group: "Greek" },
  { keys: "G Shift+G", command: "\\Gamma", name: "Gamma", group: "Greek" },
  { keys: "G Shift+L", command: "\\Lambda", name: "Lambda", group: "Greek" },
  { keys: "G Shift+P", command: "\\Pi", name: "Pi", group: "Greek" },
  { keys: "G Shift+S", command: "\\Sigma", name: "Sigma", group: "Greek" },
  { keys: "G Shift+T", command: "\\varsigma", name: "varsigma", group: "Greek" },
  { keys: "G Shift+U", command: "\\Upsilon", name: "Upsilon", group: "Greek" },
  { keys: "G Shift+V", command: "\\Theta", name: "Theta", group: "Greek" },
  { keys: "G Shift+O", command: "\\Omega", name: "Omega", group: "Greek" },
  { keys: "G Shift+X", command: "\\Xi", name: "Xi", group: "Greek" },
  { keys: "G Shift+Y", command: "\\Psi", name: "Psi", group: "Greek" },

  // Extra delimiters (B prefix)
  { keys: "B N", command: "\\left\\|$$\\right\\|", name: "Norm", group: "Delimiters" },
  { keys: "B F", command: "\\left\\lfloor$$\\right\\rfloor", name: "Floor", group: "Delimiters" },
  { keys: "B E", command: "\\left\\lceil$$\\right\\rceil", name: "Ceiling", group: "Delimiters" },
  { keys: "A W", command: "\\widehat{$$}", name: "Wide hat", group: "Accents" },

  // Arrows (W prefix)
  { keys: "W R", command: "\\rightarrow", name: "Right arrow", group: "Arrows" },
  { keys: "W L", command: "\\leftarrow", name: "Left arrow", group: "Arrows" },
  { keys: "W Shift+R", command: "\\Rightarrow", name: "Double right arrow", group: "Arrows" },
  { keys: "W Shift+L", command: "\\Leftarrow", name: "Double left arrow", group: "Arrows" },
  { keys: "W M", command: "\\mapsto", name: "Maps to", group: "Arrows" },

  // Extra operators (O prefix)
  { keys: "O T", command: "\\times", name: "Times", group: "Operators" },
  { keys: "O C", command: "\\cdot", name: "Center dot", group: "Operators" },
  { keys: "O D", command: "\\div", name: "Divide", group: "Operators" },
  { keys: "O E", command: "\\equiv", name: "Equivalent", group: "Operators" },
  { keys: "O L", command: "\\leq", name: "Less or equal", group: "Operators" },
  { keys: "O G", command: "\\geq", name: "Greater or equal", group: "Operators" },
  { keys: "O A", command: "\\approx", name: "Approx", group: "Operators" },
  { keys: "O I", command: "\\in", name: "Element of", group: "Operators" },
  { keys: "O U", command: "\\cup", name: "Union", group: "Operators" },
  { keys: "O Shift+U", command: "\\cap", name: "Intersection", group: "Operators" },
  { keys: "O Shift+N", command: "\\nabla", name: "Nabla", group: "Operators" },

  // Fonts (T prefix)
  { keys: "T B", command: "\\mathbf{$$}", name: "Bold", group: "Fonts" },
  { keys: "T C", command: "\\mathcal{$$}", name: "Caligraphic", group: "Fonts" },
  { keys: "T R", command: "\\mathrm{$$}", name: "Roman", group: "Fonts" },
  { keys: "T Shift+R", command: "\\mathbb{$$}", name: "Blackboard bold", group: "Fonts" },
  { keys: "T T", command: "\\text{$$}", name: "Text", group: "Fonts" },

  // Matrices (M prefix)
  { keys: "M P", command: "\\begin{pmatrix}\n$$\n\\end{pmatrix}", name: "Matrix (parens)", group: "Matrices" },
  { keys: "M B", command: "\\begin{bmatrix}\n$$\n\\end{bmatrix}", name: "Matrix (brackets)", group: "Matrices" },
  { keys: "M C", command: "\\begin{cases}\n$$\n\\end{cases}", name: "Cases", group: "Matrices" },
];
