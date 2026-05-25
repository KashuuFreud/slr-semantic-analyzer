const sourceInput = document.getElementById("sourceInput");
const srcFileInput = document.getElementById("srcFileInput");
const fileNameTag = document.getElementById("fileNameTag");

const loadBasicBtn = document.getElementById("loadBasicBtn");
const loadControlBtn = document.getElementById("loadControlBtn");
const loadOptimizeBtn = document.getElementById("loadOptimizeBtn");
const loadErrorBtn = document.getElementById("loadErrorBtn");
const runBtn = document.getElementById("runBtn");
const clearBtn = document.getElementById("clearBtn");

const tokenList = document.getElementById("tokenList");
const tokenCount = document.getElementById("tokenCount");
const traceList = document.getElementById("traceList");
const astView = document.getElementById("astView");
const symbolTable = document.getElementById("symbolTable");
const errorList = document.getElementById("errorList");
const errorStatus = document.getElementById("errorStatus");
const quadList = document.getElementById("quadList");
const optList = document.getElementById("optList");
const asmList = document.getElementById("asmList");

const metricAst = document.getElementById("metricAst");
const metricSymbol = document.getElementById("metricSymbol");
const metricQuad = document.getElementById("metricQuad");
const metricOpt = document.getElementById("metricOpt");
const metricError = document.getElementById("metricError");
const metricWarning = document.getElementById("metricWarning");

const examples = {
  basic: `int main() {
  int x;
  x = 5;
  return 0
};
main()`,

  control: `int main() {
  int score;
  score = 85;
  if (score <= 90) {
    return 1
  }
  else {
    if (score <= 60) {
      return 2
    }
    else {
      return 3
    };
  };
  return 0
};
main()`,

  optimize: `int main() {
  int a;
  int b;
  int c;
  a = 2;
  b = 3;
  c = 2 * 3 + 0;
  a = a + 0;
  b = b * 1;
  c = c * 0;
  print c
};
main()`,

  error: `int main() {
  foo()
};
main()
// 错误：函数 foo 未声明`
};

loadBasicBtn.onclick = () => {
  sourceInput.value = examples.basic;
  fileNameTag.textContent = "basic case";
  runAnalysis();
};

loadControlBtn.onclick = () => {
  sourceInput.value = examples.control;
  fileNameTag.textContent = "control case";
  runAnalysis();
};

loadOptimizeBtn.onclick = () => {
  sourceInput.value = examples.optimize;
  fileNameTag.textContent = "optimization case";
  runAnalysis();
};

loadErrorBtn.onclick = () => {
  sourceInput.value = examples.error;
  fileNameTag.textContent = "error case";
  runAnalysis();
};

srcFileInput.onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  sourceInput.value = text;
  fileNameTag.textContent = file.name;
  runAnalysis();
  event.target.value = "";
};

runBtn.onclick = () => {
  fileNameTag.textContent = fileNameTag.textContent || "manual input";
  runAnalysis();
};

clearBtn.onclick = () => {
  sourceInput.value = "";
  fileNameTag.textContent = "manual input";
  renderTokens([]);
  setEmpty(traceList, "trace-list empty", "Run IR generation first.");
  setEmpty(astView, "tree-view empty", "Run IR generation first.");
  setEmpty(symbolTable, "table-wrap empty", "Run IR generation first.");
  setEmpty(errorList, "error-list empty", "Run IR generation first.");
  setEmpty(quadList, "ir-list empty", "Run IR generation first.");
  setEmpty(optList, "ir-list empty", "Run IR generation first.");
  setEmpty(asmList, "asm-list empty", "Run IR generation first.");
  updateMetrics(0, 0, 0, 0, 0, 0);
  errorStatus.textContent = "Waiting";
  errorStatus.className = "tag";
};

sourceInput.value = examples.basic;

function setEmpty(el, cls, text) {
  el.innerHTML = "";
  el.className = cls;
  el.textContent = text;
}

function escapeHTML(s) {
  return String(s).replace(/[&<>'"]/g, ch => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;"
  }[ch]));
}

function updateMetrics(ast, symbols, quads, opt, errors, warnings) {
  metricAst.textContent = ast;
  metricSymbol.textContent = symbols;
  metricQuad.textContent = quads;
  metricOpt.textContent = opt;
  metricError.textContent = errors;
  metricWarning.textContent = warnings;
}

/* =========================
   Lexer
   ========================= */

const KEYWORDS = new Map([
  ["int", "INT"],
  ["float", "FLOAT"],
  ["void", "VOID"],
  ["if", "IF"],
  ["else", "ELSE"],
  ["while", "WHILE"],
  ["return", "RETURN"],
  ["input", "INPUT"],
  ["print", "PRINT"]
]);

const SINGLE = {
  "+": "ADD",
  "-": "SUB",
  "*": "MUL",
  "/": "DIV",
  "=": "ASG",
  "<": "ROP",
  ">": "ROP",
  "!": "NOT",
  "(": "LPAR",
  ")": "RPAR",
  "{": "LBR",
  "}": "RBR",
  "[": "LBK",
  "]": "RBK",
  ",": "CMA",
  ";": "SCO"
};

const DOUBLE = {
  "<=": "ROP",
  ">=": "ROP",
  "==": "ROP",
  "!=": "ROP",
  "&&": "BOP",
  "||": "BOP",
  "+=": "AAS"
};

function tokenize(src) {
  const tokens = [];
  let i = 0;
  let line = 1;

  const push = (type, lexeme, lineNo = line) => {
    tokens.push({ type, lexeme, line: lineNo });
  };

  while (i < src.length) {
    const ch = src[i];

    if (ch === "\n") {
      line++;
      i++;
      continue;
    }

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    if (src[i] === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }

    if (src[i] === "/" && src[i + 1] === "*") {
      const startLine = line;
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        if (src[i] === "\n") line++;
        i++;
      }
      if (i < src.length) i += 2;
      else push("ERROR", "unclosed comment", startLine);
      continue;
    }

    if (ch === "\"" || ch === "'") {
      const quote = ch;
      const startLine = line;
      let text = quote;
      i++;
      while (i < src.length && src[i] !== quote && src[i] !== "\n") {
        text += src[i];
        i++;
      }
      if (src[i] === quote) {
        text += quote;
        i++;
      }
      push("ERROR", `unsupported string literal ${text}`, startLine);
      continue;
    }

    const two = src.slice(i, i + 2);
    if (DOUBLE[two]) {
      push(DOUBLE[two], two);
      i += 2;
      continue;
    }

    if (/[A-Za-z_]/.test(ch)) {
      const start = i;
      while (/[A-Za-z0-9_]/.test(src[i] || "")) i++;
      const lexeme = src.slice(start, i);
      push(KEYWORDS.get(lexeme) || "ID", lexeme);
      continue;
    }

    if (/[0-9]/.test(ch) || ch === ".") {
      const start = i;
      let hasDot = false;
      let hasExp = false;
      let ok = true;

      if (ch === ".") {
        hasDot = true;
        i++;
      }

      while (/[0-9]/.test(src[i] || "")) i++;

      if (src[i] === ".") {
        hasDot = true;
        i++;
        while (/[0-9]/.test(src[i] || "")) i++;
      }

      if (/[eE]/.test(src[i] || "")) {
        hasExp = true;
        i++;
        if (/[+-]/.test(src[i] || "")) i++;
        if (!/[0-9]/.test(src[i] || "")) ok = false;
        while (/[0-9]/.test(src[i] || "")) i++;
      }

      const lexeme = src.slice(start, i);
      push(ok ? (hasDot || hasExp ? "FLO" : "NUM") : "ERROR", lexeme);
      continue;
    }

    if (SINGLE[ch]) {
      push(SINGLE[ch], ch);
      i++;
      continue;
    }

    push("ERROR", ch);
    i++;
  }

  push("EOF", "$", line);
  return tokens;
}

function renderTokens(tokens) {
  tokenList.innerHTML = "";
  tokenList.className = "token-list";
  tokenCount.textContent = `${Math.max(tokens.length - 1, 0)} tokens`;

  if (tokens.length <= 1) {
    setEmpty(tokenList, "token-list empty", "No tokens generated.");
    return;
  }

  tokens.filter(t => t.type !== "EOF").forEach(t => {
    const div = document.createElement("div");
    div.className = "token-item" + (t.type === "ERROR" ? " error" : "");
    div.innerHTML = `
      <div class="token-type">${escapeHTML(t.type)}</div>
      <div class="token-lexeme">${escapeHTML(t.lexeme)}</div>
      <div class="token-line">line ${t.line}</div>
    `;
    tokenList.appendChild(div);
  });
}

/* =========================
   Context
   ========================= */

class SemanticContext {
  constructor() {
    this.scopes = [];
    this.allScopes = [];
    this.nextScopeId = 0;
    this.nextTemp = 0;
    this.nextLabel = 0;
    this.errors = [];
    this.warnings = [];
    this.trace = [];
    this.ir = [];
    this.enterScope("global");
  }

  enterScope(kind) {
    const parent = this.scopes.at(-1) || null;
    const scope = {
      id: this.nextScopeId++,
      kind,
      name: `${kind}_${this.nextScopeId - 1}`,
      parent: parent ? parent.id : null,
      symbols: new Map(),
      offset: 0,
      children: []
    };
    if (parent) parent.children.push(scope);
    this.scopes.push(scope);
    this.allScopes.push(scope);
    this.trace.push(`enter scope ${scope.name}`);
    return scope;
  }

  leaveScope() {
    const scope = this.scopes.pop();
    if (scope) this.trace.push(`leave scope ${scope.name}`);
    return scope;
  }

  currentScope() {
    return this.scopes.at(-1);
  }

  currentScopeName() {
    return this.currentScope()?.name || "unknown";
  }

  declare(name, info, line) {
    const scope = this.currentScope();

    if (scope.symbols.has(name)) {
      this.err(`duplicate declaration: '${name}'`, line);
      return scope.symbols.get(name);
    }

    const size = info.type === "float" ? 8 : 4;
    const arraySize = info.arraySize || null;
    const sym = {
      name,
      type: info.type,
      kind: info.kind || "var",
      scope: scope.name,
      scopeId: scope.id,
      line,
      addr: `${scope.id === 0 ? "G" : "L"}${scope.id}_${scope.offset}`,
      size,
      params: info.params || [],
      arraySize,
      isArray: info.kind === "array" || info.kind === "arrayParam"
    };

    scope.offset += size * (arraySize || 1);
    scope.symbols.set(name, sym);
    this.trace.push(`declare ${name}: type=${sym.type}, kind=${sym.kind}, addr=${sym.addr}`);
    return sym;
  }

  lookup(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const sym = this.scopes[i].symbols.get(name);
      if (sym) return sym;
    }
    return null;
  }

  lookupGlobal(name) {
    return this.allScopes[0]?.symbols.get(name) || null;
  }

  err(msg, line) {
    this.errors.push({ line, msg });
    this.trace.push(`ERROR line ${line}: ${msg}`);
  }

  warn(msg, line) {
    this.warnings.push({ line, msg });
    this.trace.push(`warning line ${line}: ${msg}`);
  }

  temp(type) {
    const place = `t${this.nextTemp++}`;
    this.trace.push(`new temp ${place}: type=${type}`);
    return { place, type };
  }

  label() {
    const label = `L${this.nextLabel++}`;
    this.trace.push(`new label ${label}`);
    return label;
  }

  emit(op, a1 = "", a2 = "", res = "", note = "") {
    const quad = { op, a1, a2, res, note };
    this.ir.push(quad);
    this.trace.push(`emit (${op}, ${a1}, ${a2}, ${res})${note ? " ; " + note : ""}`);
    return quad;
  }
}

function node(kind, props = {}, children = []) {
  return { kind, ...props, children };
}

/* =========================
   Parser + IR Generator
   ========================= */

class Parser {
  constructor(tokens, ctx) {
    this.tokens = tokens;
    this.i = 0;
    this.ctx = ctx;
  }

  peek(k = 0) {
    return this.tokens[this.i + k] || this.tokens.at(-1);
  }

  match(type, lexeme = null) {
    const t = this.peek();
    return t.type === type && (lexeme === null || t.lexeme === lexeme);
  }

  consume(type, what = type) {
    if (this.match(type)) return this.tokens[this.i++];

    const t = this.peek();
    this.ctx.err(`expected ${what}, got '${t.lexeme}'`, t.line);
    return { type, lexeme: "", line: t.line, synthetic: true };
  }

  optionalSemi() {
    let used = false;
    while (this.match("SCO")) {
      this.consume("SCO", ";");
      used = true;
    }
    return used;
  }

  isType() {
    return ["INT", "FLOAT", "VOID"].includes(this.peek().type);
  }

  typeToken() {
    const t = this.peek();
    if (this.isType()) {
      this.i++;
      return t.lexeme;
    }
    this.ctx.err("expected type specifier", t.line);
    this.i++;
    return "error";
  }

  parseProgram() {
    const children = [];
    while (!this.match("EOF")) {
      if (this.match("SCO")) {
        this.optionalSemi();
        continue;
      }
      if (this.match("ERROR")) {
        const t = this.consume("ERROR");
        this.ctx.err(`lexical error: ${t.lexeme}`, t.line);
        continue;
      }
      children.push(this.parseTopLevel());
      this.optionalSemi();
    }
    return node("Program", { scope: "global_0" }, children.filter(Boolean));
  }

  parseTopLevel() {
    if (this.isType() && this.peek(1).type === "ID" && this.peek(2).type === "LPAR") {
      return this.parseFunction();
    }
    if (this.isType()) return this.parseDeclaration();
    return this.parseStatement();
  }

  parseFunction() {
    const type = this.typeToken();
    const id = this.consume("ID", "function name");

    this.consume("LPAR", "(");
    const params = this.parseParamList();
    this.consume("RPAR", ")");

    this.ctx.declare(id.lexeme, { type, kind: "function", params }, id.line);

    this.ctx.enterScope(`function_${id.lexeme}`);
    params.forEach(p => {
      this.ctx.declare(p.name, {
        type: p.type,
        kind: p.isArray ? "arrayParam" : "param",
        arraySize: null
      }, p.line);
    });

    const body = this.parseBlock(false);
    this.ctx.leaveScope();
    this.optionalSemi();

    return node("Function", { name: id.lexeme, type, params }, [body]);
  }

  parseParamList() {
    const params = [];
    if (this.match("RPAR")) return params;

    while (!this.match("RPAR") && !this.match("EOF")) {
      if (!this.isType()) {
        this.ctx.err("expected parameter type", this.peek().line);
        break;
      }

      const pType = this.typeToken();
      const pName = this.consume("ID", "parameter name");
      let isArray = false;

      if (this.match("LBK")) {
        this.consume("LBK", "[");
        if (this.match("NUM")) this.consume("NUM", "array size");
        this.consume("RBK", "]");
        isArray = true;
      }

      if (this.match("LPAR")) {
        this.consume("LPAR", "(");
        this.consume("RPAR", ")");
      }

      params.push({ name: pName.lexeme, type: pType, isArray, line: pName.line });

      if (this.match("SCO")) {
        this.consume("SCO", ";");
        if (this.match("RPAR")) break;
        continue;
      }

      if (this.match("CMA")) {
        this.consume("CMA", ",");
        if (this.match("RPAR")) break;
        continue;
      }

      break;
    }

    return params;
  }

  parseBlock(createScope = true) {
    const start = this.consume("LBR", "{");
    if (createScope) this.ctx.enterScope("block");

    const stmts = [];
    while (!this.match("RBR") && !this.match("EOF")) {
      if (this.match("SCO")) {
        this.optionalSemi();
        continue;
      }
      if (this.match("ERROR")) {
        const t = this.consume("ERROR");
        this.ctx.err(`lexical error: ${t.lexeme}`, t.line);
        continue;
      }
      stmts.push(this.parseStatement());
      this.optionalSemi();
    }

    const scopeName = this.ctx.currentScopeName();
    this.consume("RBR", "}");
    if (createScope) this.ctx.leaveScope();
    this.optionalSemi();

    return node("Block", { scope: scopeName, line: start.line }, stmts.filter(Boolean));
  }

  parseStatement() {
    if (this.isType()) return this.parseDeclaration();
    if (this.match("LBR")) return this.parseBlock(true);
    if (this.match("IF")) return this.parseIf();
    if (this.match("WHILE")) return this.parseWhile();
    if (this.match("RETURN")) return this.parseReturn();
    if (this.match("PRINT")) return this.parsePrint();
    if (this.match("INPUT")) return this.parseInput();
    if (this.match("ID")) return this.parseIdStatement();

    const t = this.peek();
    this.ctx.err(`unexpected token '${t.lexeme}'`, t.line);
    this.i++;
    return node("Error", { line: t.line });
  }

  parseDeclaration() {
    const type = this.typeToken();
    const id = this.consume("ID", "identifier");

    let arraySize = null;
    let init = null;

    if (this.match("LBK")) {
      this.consume("LBK", "[");
      if (!this.match("RBK")) {
        const n = this.consume("NUM", "array size");
        arraySize = parseInt(n.lexeme || "0", 10);
      }
      this.consume("RBK", "]");
    }

    const sym = this.ctx.declare(id.lexeme, {
      type,
      kind: arraySize !== null ? "array" : "var",
      arraySize
    }, id.line);

    if (this.match("ASG")) {
      this.consume("ASG", "=");
      init = this.parseExpression();
      this.checkAssign(type, init, id.line);
      if (sym) this.ctx.emit("=", init.place, "", sym.addr, `initialize ${id.lexeme}`);
    }

    this.optionalSemi();

    return node("Decl", {
      name: id.lexeme,
      type,
      kind: arraySize !== null ? "array" : "var",
      addr: sym ? sym.addr : "?",
      line: id.line
    }, init ? [init.ast] : []);
  }

  parseIdStatement() {
    const id = this.consume("ID", "identifier");

    if (this.match("LPAR")) {
      const call = this.finishCall(id);
      this.optionalSemi();
      return call.ast;
    }

    const lv = this.finishLValueAfterId(id);

    if (this.match("ASG")) {
      this.consume("ASG", "=");
      const rhs = this.parseExpression();
      this.emitAssignment(lv, rhs, id.line);
      this.optionalSemi();
      return node("Assign", { name: id.lexeme, line: id.line }, [lv.ast, rhs.ast]);
    }

    if (this.match("AAS")) {
      this.consume("AAS", "+=");
      const rhs = this.parseExpression();
      const oldVal = lv.place;
      const tmp = this.ctx.temp(this.numericResult(lv.type, rhs.type, id.line));
      this.ctx.emit("+", oldVal, rhs.place, tmp.place, "+= expression");
      this.emitAssignment(lv, tmp, id.line);
      this.optionalSemi();
      return node("AssignAdd", { name: id.lexeme, line: id.line }, [lv.ast, rhs.ast]);
    }

    this.ctx.err("expected assignment or function call", id.line);
    return node("Error", { line: id.line });
  }

  finishLValueAfterId(id) {
    const sym = this.ctx.lookup(id.lexeme);

    if (!sym) {
      this.ctx.err(`undeclared variable: '${id.lexeme}'`, id.line);
      return {
        kind: "var",
        name: id.lexeme,
        type: "error",
        place: id.lexeme,
        ast: node("Identifier", { name: id.lexeme, type: "error", line: id.line })
      };
    }

    if (this.match("LBK")) {
      this.consume("LBK", "[");
      const index = this.parseExpression();
      this.consume("RBK", "]");
      const tmp = this.ctx.temp(sym.type);
      this.ctx.emit("[]", sym.addr, index.place, tmp.place, `load ${id.lexeme}[index]`);
      return {
        kind: "arrayElem",
        name: id.lexeme,
        type: sym.type,
        base: sym.addr,
        index: index.place,
        place: tmp.place,
        ast: node("ArrayAccess", {
          name: id.lexeme,
          type: sym.type,
          base: sym.addr,
          index: index.place,
          line: id.line
        }, [index.ast])
      };
    }

    return {
      kind: "var",
      name: id.lexeme,
      type: sym.type,
      place: sym.addr,
      ast: node("Identifier", {
        name: id.lexeme,
        type: sym.type,
        addr: sym.addr,
        line: id.line
      })
    };
  }

  emitAssignment(lv, rhs, line) {
    this.checkAssign(lv.type, rhs, line);

    if (lv.kind === "arrayElem") {
      this.ctx.emit("[]=", lv.base, lv.index, rhs.place, `${lv.name}[index] = value`);
    } else {
      this.ctx.emit("=", rhs.place, "", lv.place, `assign to ${lv.name}`);
    }
  }

  parseIf() {
    const t = this.consume("IF", "if");
    this.consume("LPAR", "(");
    const cond = this.parseExpression();
    this.consume("RPAR", ")");

    if (!["bool", "int", "float", "error"].includes(cond.type)) {
      this.ctx.warn("condition converted to bool", t.line);
    }

    const falseLabel = this.ctx.label();
    const endLabel = this.ctx.label();

    this.ctx.emit("ifFalse", cond.place, "", falseLabel, "if false branch");

    const thenNode = this.parseStatement();
    this.optionalSemi();

    let elseNode = null;

    if (this.match("ELSE")) {
      this.ctx.emit("goto", "", "", endLabel, "jump over else branch");
      this.ctx.emit("label", "", "", falseLabel, "else label");

      this.consume("ELSE", "else");
      elseNode = this.parseStatement();
      this.optionalSemi();

      this.ctx.emit("label", "", "", endLabel, "if end");
    } else {
      this.ctx.emit("label", "", "", falseLabel, "if end");
    }

    return node("If", { line: t.line }, elseNode ? [cond.ast, thenNode, elseNode] : [cond.ast, thenNode]);
  }

  parseWhile() {
    const t = this.consume("WHILE", "while");

    const beginLabel = this.ctx.label();
    const endLabel = this.ctx.label();

    this.ctx.emit("label", "", "", beginLabel, "while begin");

    this.consume("LPAR", "(");
    const cond = this.parseExpression();
    this.consume("RPAR", ")");

    this.ctx.emit("ifFalse", cond.place, "", endLabel, "while exit");

    const body = this.parseStatement();
    this.optionalSemi();

    this.ctx.emit("goto", "", "", beginLabel, "loop back");
    this.ctx.emit("label", "", "", endLabel, "while end");

    return node("While", { line: t.line }, [cond.ast, body]);
  }

  parseReturn() {
    const t = this.consume("RETURN", "return");
    let expr = null;

    if (!this.match("SCO") && !this.match("RBR") && !this.match("EOF")) {
      expr = this.parseExpression();
    }

    this.ctx.emit("return", expr ? expr.place : "", "", "", "return statement");
    this.optionalSemi();

    return node("Return", { line: t.line }, expr ? [expr.ast] : []);
  }

  parsePrint() {
    const t = this.consume("PRINT", "print");
    let expr;

    if (this.match("LPAR")) {
      this.consume("LPAR", "(");
      expr = this.parseExpression();
      this.consume("RPAR", ")");
    } else {
      expr = this.parseExpression();
    }

    this.ctx.emit("print", expr.place, "", "", "print statement");
    this.optionalSemi();

    return node("Print", { line: t.line }, [expr.ast]);
  }

  parseInput() {
    const t = this.consume("INPUT", "input");
    let id;

    if (this.match("LPAR")) {
      this.consume("LPAR", "(");
      id = this.consume("ID", "identifier");
      this.consume("RPAR", ")");
    } else {
      id = this.consume("ID", "identifier");
    }

    const sym = this.ctx.lookup(id.lexeme);
    if (!sym) this.ctx.err(`undeclared variable: '${id.lexeme}'`, id.line);
    else this.ctx.emit("input", "", "", sym.addr, `input ${id.lexeme}`);

    this.optionalSemi();
    return node("Input", { name: id.lexeme, line: t.line });
  }

  parseExpression() {
    return this.parseAssignmentExpr();
  }

  parseAssignmentExpr() {
    const left = this.parseRelational();

    if (this.match("ASG")) {
      if (!left.assignable) {
        this.ctx.err("left side of assignment is not assignable", this.peek().line);
      }

      this.consume("ASG", "=");
      const rhs = this.parseAssignmentExpr();

      if (left.assignable) {
        this.emitAssignment(left.lvalue, rhs, this.peek().line);
        return {
          type: left.lvalue.type,
          place: left.lvalue.place,
          ast: node("AssignExpr", { type: left.lvalue.type }, [left.ast, rhs.ast])
        };
      }
    }

    return left;
  }

  parseRelational() {
    let left = this.parseAdditive();

    while (this.match("ROP") && ["<", "<=", ">", ">=", "==", "!="].includes(this.peek().lexeme)) {
      const op = this.consume("ROP").lexeme;
      const right = this.parseAdditive();
      left = this.makeBinary(op, left, right, "bool");
    }

    if (this.match("BOP")) {
      const t = this.consume("BOP");
      this.ctx.err(`unsupported boolean operator '${t.lexeme}' in this grammar`, t.line);
      const right = this.parseAdditive();
      left = this.makeBinary(t.lexeme, left, right, "bool");
    }

    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();

    while (this.match("ADD") || this.match("SUB")) {
      const op = this.consume(this.peek().type).lexeme;
      const right = this.parseMultiplicative();
      left = this.makeBinary(op, left, right, this.numericResult(left.type, right.type, this.peek().line));
    }

    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();

    while (this.match("MUL") || this.match("DIV")) {
      const op = this.consume(this.peek().type).lexeme;
      const right = this.parseUnary();
      left = this.makeBinary(op, left, right, this.numericResult(left.type, right.type, this.peek().line));
    }

    return left;
  }

  parseUnary() {
    if (this.match("SUB")) {
      const t = this.consume("SUB", "-");
      const e = this.parseUnary();
      const tmp = this.ctx.temp(e.type);
      this.ctx.emit("uminus", e.place, "", tmp.place, "unary minus");
      return {
        type: e.type,
        place: tmp.place,
        ast: node("UnaryExpr", { op: "-", type: e.type, line: t.line }, [e.ast])
      };
    }

    if (this.match("NOT")) {
      const t = this.consume("NOT", "!");
      const e = this.parseUnary();
      const tmp = this.ctx.temp("bool");
      this.ctx.emit("!", e.place, "", tmp.place, "logical not");
      return {
        type: "bool",
        place: tmp.place,
        ast: node("UnaryExpr", { op: "!", type: "bool", line: t.line }, [e.ast])
      };
    }

    return this.parsePrimary();
  }

  parsePrimary() {
    const t = this.peek();

    if (this.match("NUM")) {
      this.i++;
      return {
        type: "int",
        place: t.lexeme,
        isConst: true,
        constValue: Number(t.lexeme),
        ast: node("IntLiteral", { value: t.lexeme, type: "int", line: t.line })
      };
    }

    if (this.match("FLO")) {
      this.i++;
      return {
        type: "float",
        place: t.lexeme,
        isConst: true,
        constValue: Number(t.lexeme),
        ast: node("FloatLiteral", { value: t.lexeme, type: "float", line: t.line })
      };
    }

    if (this.match("ID")) {
      const id = this.consume("ID", "identifier");

      if (this.match("LPAR")) {
        return this.finishCall(id);
      }

      const lv = this.finishLValueAfterId(id);

      return {
        type: lv.type,
        place: lv.place,
        assignable: true,
        lvalue: lv,
        ast: lv.ast
      };
    }

    if (this.match("LPAR")) {
      this.consume("LPAR", "(");
      const e = this.parseExpression();
      this.consume("RPAR", ")");
      return e;
    }

    if (this.match("ERROR")) {
      const e = this.consume("ERROR");
      this.ctx.err(`lexical error: ${e.lexeme}`, e.line);
      return {
        type: "error",
        place: "?",
        ast: node("ErrorExpr", { line: e.line })
      };
    }

    this.ctx.err(`invalid expression near '${t.lexeme}'`, t.line);
    this.i++;

    return {
      type: "error",
      place: "?",
      ast: node("ErrorExpr", { line: t.line })
    };
  }

  finishCall(id) {
    this.consume("LPAR", "(");

    const args = [];
    if (!this.match("RPAR")) {
      while (!this.match("RPAR") && !this.match("EOF")) {
        args.push(this.parseExpression());

        if (this.match("CMA")) {
          this.consume("CMA", ",");
          if (this.match("RPAR")) break;
          continue;
        }

        break;
      }
    }

    this.consume("RPAR", ")");

    const fn = this.ctx.lookupGlobal(id.lexeme);
    let ret = "error";

    if (!fn || fn.kind !== "function") {
      this.ctx.err(`undeclared function: '${id.lexeme}'`, id.line);
    } else {
      ret = fn.type;

      if (args.length !== fn.params.length) {
        this.ctx.err(`function '${id.lexeme}' expects ${fn.params.length} arguments, got ${args.length}`, id.line);
      }

      args.forEach((a, idx) => {
        const p = fn.params[idx];
        if (p) this.checkAssign(p.type, a, id.line);
      });
    }

    const tmp = this.ctx.temp(ret);
    this.ctx.emit("call", id.lexeme, args.map(a => a.place).join(", "), tmp.place, "function call");

    return {
      type: ret,
      place: tmp.place,
      ast: node("Call", { name: id.lexeme, type: ret, line: id.line, place: tmp.place }, args.map(a => a.ast))
    };
  }

  numericResult(a, b, line) {
    if (a === "error" || b === "error") return "error";

    if (!["int", "float"].includes(a) || !["int", "float"].includes(b)) {
      this.ctx.err(`operator requires numeric operands, got ${a} and ${b}`, line);
      return "error";
    }

    return a === "float" || b === "float" ? "float" : "int";
  }

  checkAssign(target, expr, line) {
    if (target === "error" || expr.type === "error") return;
    if (target === expr.type) return;

    if (target === "float" && expr.type === "int") {
      this.ctx.warn("implicit conversion int -> float", line);
      return;
    }

    this.ctx.err(`type mismatch: cannot assign ${expr.type} to ${target}`, line);
  }

  makeBinary(op, left, right, type) {
    const tmp = this.ctx.temp(type);
    this.ctx.emit(op, left.place, right.place, tmp.place, `binary expression ${op}`);

    return {
      type,
      place: tmp.place,
      ast: node("BinaryExpr", { op, type, place: tmp.place }, [left.ast, right.ast])
    };
  }
}

/* =========================
   Optimization
   ========================= */

function isNumberText(x) {
  return x !== "" && x !== null && x !== undefined && !Number.isNaN(Number(x));
}

function formatNumber(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toFixed(8)));
}

function foldBinary(op, a, b) {
  const x = Number(a);
  const y = Number(b);

  switch (op) {
    case "+": return x + y;
    case "-": return x - y;
    case "*": return x * y;
    case "/": return y !== 0 ? x / y : null;
    case "<": return x < y ? 1 : 0;
    case "<=": return x <= y ? 1 : 0;
    case ">": return x > y ? 1 : 0;
    case ">=": return x >= y ? 1 : 0;
    case "==": return x === y ? 1 : 0;
    case "!=": return x !== y ? 1 : 0;
    default: return null;
  }
}

function optimizeIR(ir) {
  const optimized = [];
  const replace = new Map();

  const resolve = x => {
    let cur = x;
    const visited = new Set();

    while (replace.has(cur) && !visited.has(cur)) {
      visited.add(cur);
      cur = replace.get(cur);
    }

    return cur;
  };

  for (const q of ir) {
    let op = q.op;
    let a1 = resolve(q.a1);
    let a2 = resolve(q.a2);
    let res = q.res;

    if (["+", "-", "*", "/", "<", "<=", ">", ">=", "==", "!="].includes(op)) {
      if (isNumberText(a1) && isNumberText(a2)) {
        const folded = foldBinary(op, a1, a2);

        if (folded !== null) {
          replace.set(res, formatNumber(folded));
          optimized.push({
            op: "=",
            a1: formatNumber(folded),
            a2: "",
            res,
            note: `constant folding: ${a1} ${op} ${a2}`
          });
          continue;
        }
      }

      if (op === "+" && a2 === "0") {
        replace.set(res, a1);
        optimized.push({ op: "=", a1, a2: "", res, note: "x + 0" });
        continue;
      }

      if (op === "+" && a1 === "0") {
        replace.set(res, a2);
        optimized.push({ op: "=", a1: a2, a2: "", res, note: "0 + x" });
        continue;
      }

      if (op === "-" && a2 === "0") {
        replace.set(res, a1);
        optimized.push({ op: "=", a1, a2: "", res, note: "x - 0" });
        continue;
      }

      if (op === "*" && a2 === "1") {
        replace.set(res, a1);
        optimized.push({ op: "=", a1, a2: "", res, note: "x * 1" });
        continue;
      }

      if (op === "*" && a1 === "1") {
        replace.set(res, a2);
        optimized.push({ op: "=", a1: a2, a2: "", res, note: "1 * x" });
        continue;
      }

      if (op === "*" && (a1 === "0" || a2 === "0")) {
        replace.set(res, "0");
        optimized.push({ op: "=", a1: "0", a2: "", res, note: "x * 0" });
        continue;
      }

      if (op === "/" && a2 === "1") {
        replace.set(res, a1);
        optimized.push({ op: "=", a1, a2: "", res, note: "x / 1" });
        continue;
      }
    }

    if (op === "=" || op === "ifFalse" || op === "print" || op === "return") {
      optimized.push({ ...q, a1: resolve(a1), a2: resolve(a2), res, note: q.note || "" });
      continue;
    }

    optimized.push({ ...q, a1, a2, res, note: q.note || "" });
  }

  return optimized;
}

/* =========================
   Pseudo Assembly
   ========================= */

function toPseudoAssembly(ir) {
  const asm = [];

  for (const q of ir) {
    switch (q.op) {
      case "label":
        asm.push(`${q.res}:`);
        break;
      case "goto":
        asm.push(`  JMP ${q.res}`);
        break;
      case "ifFalse":
        asm.push(`  JZ ${q.a1}, ${q.res}`);
        break;
      case "=":
        asm.push(`  MOV ${q.res}, ${q.a1}`);
        break;
      case "+":
        asm.push(`  ADD ${q.res}, ${q.a1}, ${q.a2}`);
        break;
      case "-":
        asm.push(`  SUB ${q.res}, ${q.a1}, ${q.a2}`);
        break;
      case "*":
        asm.push(`  MUL ${q.res}, ${q.a1}, ${q.a2}`);
        break;
      case "/":
        asm.push(`  DIV ${q.res}, ${q.a1}, ${q.a2}`);
        break;
      case "<":
      case "<=":
      case ">":
      case ">=":
      case "==":
      case "!=":
        asm.push(`  CMP_${q.op} ${q.res}, ${q.a1}, ${q.a2}`);
        break;
      case "[]":
        asm.push(`  LOAD_ARRAY ${q.res}, ${q.a1}, ${q.a2}`);
        break;
      case "[]=":
        asm.push(`  STORE_ARRAY ${q.a1}, ${q.a2}, ${q.res}`);
        break;
      case "print":
        asm.push(`  PRINT ${q.a1}`);
        break;
      case "input":
        asm.push(`  INPUT ${q.res}`);
        break;
      case "return":
        asm.push(`  RET ${q.a1}`);
        break;
      case "call":
        asm.push(`  CALL ${q.a1}, ${q.a2}`);
        asm.push(`  MOV ${q.res}, RET`);
        break;
      case "uminus":
        asm.push(`  NEG ${q.res}, ${q.a1}`);
        break;
      case "!":
        asm.push(`  NOT ${q.res}, ${q.a1}`);
        break;
      default:
        asm.push(`  ; unsupported quad (${q.op}, ${q.a1}, ${q.a2}, ${q.res})`);
        break;
    }
  }

  return asm;
}

/* =========================
   Render
   ========================= */

function runAnalysis() {
  const tokens = tokenize(sourceInput.value);
  renderTokens(tokens);

  const ctx = new SemanticContext();
  let ast;

  try {
    ast = new Parser(tokens, ctx).parseProgram();
  } catch (e) {
    ctx.err(`internal parser error: ${e.message}`, tokens[0]?.line || 1);
    ast = node("Program", {}, []);
  }

  const optimized = optimizeIR(ctx.ir);
  const asm = toPseudoAssembly(optimized);

  renderTrace(ctx.trace);
  renderAST(ast);
  renderSymbols(ctx);
  renderErrors(ctx);
  renderIR(ctx.ir, quadList);
  renderIR(optimized, optList);
  renderASM(asm);

  const symbolCount = ctx.allScopes.reduce((n, s) => n + s.symbols.size, 0);

  updateMetrics(
    countNodes(ast),
    symbolCount,
    ctx.ir.length,
    optimized.length,
    ctx.errors.length,
    ctx.warnings.length
  );
}

function renderTrace(trace) {
  traceList.innerHTML = "";
  traceList.className = "trace-list";

  if (trace.length === 0) {
    setEmpty(traceList, "trace-list empty", "No IR generation trace.");
    return;
  }

  trace.forEach((x, i) => {
    const div = document.createElement("div");
    div.className = "trace-item";
    div.innerHTML = `<strong>#${i + 1}</strong> ${escapeHTML(x)}`;
    traceList.appendChild(div);
  });
}

function renderAST(ast) {
  astView.innerHTML = "";
  astView.className = "tree-view";
  astView.appendChild(astNodeHTML(ast));
}

function astNodeHTML(n) {
  const div = document.createElement("div");
  div.className = "tree-node";

  const meta = Object.entries(n)
    .filter(([k, v]) => k !== "children" && k !== "kind" && v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}=${Array.isArray(v) ? JSON.stringify(v) : v}`)
    .join(", ");

  div.innerHTML = `
    <div>
      <span class="tree-title">${escapeHTML(n.kind)}</span>
      <span class="tree-meta">${escapeHTML(meta)}</span>
    </div>
  `;

  if (n.children && n.children.length) {
    const c = document.createElement("div");
    c.className = "children";
    n.children.forEach(ch => c.appendChild(astNodeHTML(ch)));
    div.appendChild(c);
  }

  return div;
}

function renderSymbols(ctx) {
  const rows = [];
  ctx.allScopes.forEach(scope => {
    scope.symbols.forEach(sym => rows.push(sym));
  });

  if (rows.length === 0) {
    setEmpty(symbolTable, "table-wrap empty", "No symbols.");
    return;
  }

  symbolTable.className = "table-wrap";
  symbolTable.innerHTML = `
    <table class="semantic-table">
      <thead>
        <tr>
          <th>Name</th>
          <th>Kind</th>
          <th>Type</th>
          <th>Scope</th>
          <th>Addr</th>
          <th>Size</th>
          <th>Line</th>
          <th>Extra</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(s => `
          <tr>
            <td><strong>${escapeHTML(s.name)}</strong></td>
            <td>${escapeHTML(s.kind)}</td>
            <td>${escapeHTML(s.type)}</td>
            <td class="scope-name">${escapeHTML(s.scope)}</td>
            <td class="addr">${escapeHTML(s.addr)}</td>
            <td>${s.size}</td>
            <td>${s.line}</td>
            <td>
              ${
                s.params?.length
                  ? escapeHTML(s.params.map(p => `${p.type} ${p.name}${p.isArray ? "[]" : ""}`).join("; "))
                  : (s.arraySize ? `array[${s.arraySize}]` : "")
              }
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderErrors(ctx) {
  errorList.innerHTML = "";
  errorList.className = "error-list";

  if (ctx.errors.length === 0 && ctx.warnings.length === 0) {
    errorStatus.textContent = "IR Safe";
    errorStatus.className = "tag success";

    const div = document.createElement("div");
    div.className = "error-item safe";
    div.innerHTML = `
      <strong>No error detected.</strong>
      <div class="tree-meta">The current input passed parsing, semantic checking, and IR generation.</div>
    `;
    errorList.appendChild(div);
    return;
  }

  errorStatus.textContent = ctx.errors.length ? "Error" : "Warnings Only";
  errorStatus.className = ctx.errors.length ? "tag danger" : "tag";

  ctx.errors.forEach(e => {
    const div = document.createElement("div");
    div.className = "error-item";
    div.innerHTML = `<strong>Error line ${e.line}</strong><div>${escapeHTML(e.msg)}</div>`;
    errorList.appendChild(div);
  });

  ctx.warnings.forEach(w => {
    const div = document.createElement("div");
    div.className = "error-item warning";
    div.innerHTML = `<strong>Warning line ${w.line}</strong><div>${escapeHTML(w.msg)}</div>`;
    errorList.appendChild(div);
  });
}

function renderIR(ir, target) {
  target.innerHTML = "";
  target.className = "ir-list";

  if (ir.length === 0) {
    setEmpty(target, "ir-list empty", "No IR generated.");
    return;
  }

  ir.forEach((q, i) => {
    const div = document.createElement("div");
    div.className = "ir-item";
    const note = q.note ? ` <span class="tree-meta">; ${escapeHTML(q.note)}</span>` : "";

    div.innerHTML = `
      <span class="ir-index">${String(i).padStart(2, "0")}:</span>
      (<span class="ir-op">${escapeHTML(q.op)}</span>,
      ${escapeHTML(q.a1)},
      ${escapeHTML(q.a2)},
      ${escapeHTML(q.res)})
      ${note}
    `;

    target.appendChild(div);
  });
}

function renderASM(asm) {
  asmList.innerHTML = "";
  asmList.className = "asm-list";

  if (asm.length === 0) {
    setEmpty(asmList, "asm-list empty", "No pseudo assembly generated.");
    return;
  }

  asm.forEach(line => {
    const div = document.createElement("div");
    div.className = "asm-item";
    div.textContent = line;
    asmList.appendChild(div);
  });
}

function countNodes(n) {
  return 1 + (n.children || []).reduce((sum, c) => sum + countNodes(c), 0);
}

runAnalysis();