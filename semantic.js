const sourceInput = document.getElementById("sourceInput");
const loadExampleBtn = document.getElementById("loadExampleBtn");
const loadScopeBtn = document.getElementById("loadScopeBtn");
const loadErrorBtn = document.getElementById("loadErrorBtn");
const runBtn = document.getElementById("runBtn");
const clearBtn = document.getElementById("clearBtn");
const tokenList = document.getElementById("tokenList");
const tokenCount = document.getElementById("tokenCount");
const traceList = document.getElementById("traceList");
const astView = document.getElementById("astView");
const symbolTable = document.getElementById("symbolTable");
const scopeTree = document.getElementById("scopeTree");
const errorList = document.getElementById("errorList");
const irList = document.getElementById("irList");
const errorStatus = document.getElementById("errorStatus");
const metricAst = document.getElementById("metricAst");
const metricScope = document.getElementById("metricScope");
const metricSymbol = document.getElementById("metricSymbol");
const metricError = document.getElementById("metricError");
const metricWarning = document.getElementById("metricWarning");

const examples = {
  normal: `int a = 0;
float b = 12.5;
a = a + 1;
b = b + a * 2;
print(b);`,
  scope: `int a = 1;
float b = 2.5;
{
  int a = 3;
  b = b + a;
  print(b);
}
print(a);`,
  error: `int a = 0;
float b = 1.5;
int a = 2;
c = a + 1;
a = b + 2.5;
print(c);`
};

loadExampleBtn.onclick = () => { sourceInput.value = examples.normal; runAnalysis(); };
loadScopeBtn.onclick = () => { sourceInput.value = examples.scope; runAnalysis(); };
loadErrorBtn.onclick = () => { sourceInput.value = examples.error; runAnalysis(); };
runBtn.onclick = runAnalysis;
clearBtn.onclick = () => {
  sourceInput.value = "";
  renderTokens([]);
  setEmpty(traceList, "trace-list empty", "Run semantic analysis first.");
  setEmpty(astView, "tree-view empty", "Run semantic analysis first.");
  setEmpty(symbolTable, "table-wrap empty", "Run semantic analysis first.");
  setEmpty(scopeTree, "tree-view empty", "Run semantic analysis first.");
  setEmpty(errorList, "error-list empty", "Run semantic analysis first.");
  setEmpty(irList, "ir-list empty", "Run semantic analysis first.");
  updateMetrics(0,0,0,0,0);
  errorStatus.textContent = "Waiting"; errorStatus.className = "tag";
};
sourceInput.value = examples.normal;

function setEmpty(el, cls, text){ el.innerHTML = ""; el.className = cls; el.textContent = text; }
function escapeHTML(s){ return String(s).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }
function updateMetrics(ast, scopes, symbols, errors, warnings){ metricAst.textContent=ast; metricScope.textContent=scopes; metricSymbol.textContent=symbols; metricError.textContent=errors; metricWarning.textContent=warnings; }

const KEYWORDS = new Map([["int","INT"],["float","FLOAT"],["void","VOID"],["if","IF"],["else","ELSE"],["while","WHILE"],["return","RETURN"],["input","INPUT"],["print","PRINT"]]);
const SINGLE = {"+":"ADD","-":"SUB","*":"MUL","/":"DIV","=":"ASG","<":"ROP",">":"ROP","!":"NOT","(":"LPAR",")":"RPAR","{":"LBR","}":"RBR","[":"LBK","]":"RBK",",":"CMA",";":"SCO"};
const DOUBLE = {"++":"AAA","+=":"AAS","<=":"ROP",">=":"ROP","==":"ROP","!=":"ROP","&&":"BOP","||":"BOP"};
function tokenize(src){
  const tokens=[]; let i=0,line=1;
  const push=(type,lexeme,lineNo=line)=>tokens.push({type,lexeme,line:lineNo});
  while(i<src.length){
    const ch=src[i];
    if(ch==='\n'){line++;i++;continue;} if(/\s/.test(ch)){i++;continue;}
    if(src[i]==='/'&&src[i+1]==='/'){while(i<src.length&&src[i] !== '\n') i++; continue;}
    if(src[i]==='/'&&src[i+1]==='*'){const st=line;i+=2;while(i<src.length&&!(src[i]==='*'&&src[i+1]==='/')){if(src[i]==='\n')line++;i++;} if(i<src.length)i+=2;else push("ERROR","Unclosed comment",st); continue;}
    const two=src.slice(i,i+2); if(DOUBLE[two]){push(DOUBLE[two],two);i+=2;continue;}
    if(/[A-Za-z_]/.test(ch)){const st=i;while(/[A-Za-z0-9_]/.test(src[i]||""))i++;const lex=src.slice(st,i);push(KEYWORDS.get(lex)||"ID",lex);continue;}
    if(/[0-9]/.test(ch)||ch==='.'){const st=i;let dot=false,exp=false,ok=true;if(ch==='.')dot=true,i++;while(/[0-9]/.test(src[i]||""))i++;if(src[i]==='.')dot=true,i++,(()=>{while(/[0-9]/.test(src[i]||""))i++;})();if(/[eE]/.test(src[i]||"")){exp=true;i++;if(/[+-]/.test(src[i]||""))i++;if(!/[0-9]/.test(src[i]||""))ok=false;while(/[0-9]/.test(src[i]||""))i++;}const lex=src.slice(st,i);push(ok?(dot||exp?"FLO":"NUM"):"ERROR",lex);continue;}
    if(SINGLE[ch]){push(SINGLE[ch],ch);i++;continue;} push("ERROR",ch);i++;
  }
  push("EOF","$",line); return tokens;
}
function renderTokens(tokens){
  tokenList.innerHTML=""; tokenList.className="token-list"; tokenCount.textContent=`${Math.max(tokens.length-1,0)} tokens`;
  if(tokens.length<=1){setEmpty(tokenList,"token-list empty","No tokens generated.");return;}
  tokens.filter(t=>t.type!=="EOF").forEach(t=>{const div=document.createElement("div"); div.className="token-item"+(t.type==="ERROR"?" error":""); div.innerHTML=`<div class="token-type">${escapeHTML(t.type)}</div><div class="token-lexeme">${escapeHTML(t.lexeme)}</div><div class="token-line">line ${t.line}</div>`; tokenList.appendChild(div);});
}

class SemanticContext{
  constructor(){this.scopes=[];this.allScopes=[];this.nextScopeId=0;this.nextTemp=0;this.nextLabel=0;this.errors=[];this.warnings=[];this.trace=[];this.ir=[];this.enterScope("global");}
  enterScope(kind){const parent=this.scopes.at(-1)||null;const scope={id:this.nextScopeId++,kind,name:`${kind}_${this.nextScopeId-1}`,parent:parent?parent.id:null,symbols:new Map(),offset:0,children:[]}; if(parent)parent.children.push(scope); this.scopes.push(scope); this.allScopes.push(scope); this.trace.push(`enter scope ${scope.name}`); return scope;}
  leaveScope(){const s=this.scopes.pop(); this.trace.push(`leave scope ${s.name}`); return s;}
  currentScope(){return this.scopes.at(-1);}
  currentScopeName(){return this.currentScope().name;}
  declare(name,info,line){const scope=this.currentScope(); if(scope.symbols.has(name)){this.err(`duplicate declaration: '${name}' is already declared in ${scope.name}`,line); return scope.symbols.get(name);} const size=info.type==="float"?8:4; const sym={name,type:info.type,kind:info.kind||"var",scope:scope.name,scopeId:scope.id,line,addr:`${scope.id===0?"G":"L"}${scope.id}_${scope.offset}`,size,params:info.params||[],arraySize:info.arraySize||null}; scope.offset+=size*(info.arraySize||1); scope.symbols.set(name,sym); this.trace.push(`declare ${name}: type=${sym.type}, scope=${scope.name}, addr=${sym.addr}`); return sym;}
  lookup(name){for(let i=this.scopes.length-1;i>=0;i--){const sym=this.scopes[i].symbols.get(name); if(sym)return sym;} return null;}
  lookupGlobal(name){return this.allScopes[0]?.symbols.get(name)||null;}
  err(msg,line){this.errors.push({line,msg}); this.trace.push(`ERROR line ${line}: ${msg}`);}
  warn(msg,line){this.warnings.push({line,msg}); this.trace.push(`warning line ${line}: ${msg}`);}
  temp(type){return {place:`t${this.nextTemp++}`,type};}
  label(){return `L${this.nextLabel++}`;}
  emit(op,a1="",a2="",res=""){this.ir.push({op,a1,a2,res});}
}
function node(kind, props={}, children=[]){return {kind, ...props, children};}

class Parser{
  constructor(tokens,ctx){this.tokens=tokens;this.i=0;this.ctx=ctx;}
  peek(k=0){return this.tokens[this.i+k]||this.tokens.at(-1);} match(type,lexeme=null){const t=this.peek(); return t.type===type && (lexeme===null||t.lexeme===lexeme);} consume(type,what=type){if(this.match(type)){return this.tokens[this.i++];} const t=this.peek(); this.ctx.err(`expected ${what}, got '${t.lexeme}'`,t.line); return {type,lexeme:"",line:t.line,synthetic:true};}
  parseProgram(){const children=[]; while(!this.match("EOF")){children.push(this.parseTopLevel());} return node("Program",{scope:"global_0"},children.filter(Boolean));}
  isType(){return ["INT","FLOAT","VOID"].includes(this.peek().type);} typeToken(){const t=this.peek(); if(this.isType()){this.i++; return t.lexeme;} this.ctx.err("expected type specifier",t.line); this.i++; return "error";}
  parseTopLevel(){ if(this.isType() && this.peek(1).type==="ID" && this.peek(2).type==="LPAR") return this.parseFunction(); if(this.isType()) return this.parseDeclaration(true); return this.parseStatement(); }
  parseFunction(){const type=this.typeToken(); const id=this.consume("ID","function name"); this.consume("LPAR","("); const params=[]; if(!this.match("RPAR")){do{const pType=this.typeToken(); const pName=this.consume("ID","parameter name"); params.push({name:pName.lexeme,type:pType,line:pName.line}); if(!this.match("CMA"))break; this.consume("CMA",",");}while(!this.match("RPAR"));} this.consume("RPAR",")"); this.ctx.declare(id.lexeme,{type,kind:"function",params},id.line); this.ctx.enterScope(`function_${id.lexeme}`); params.forEach(p=>this.ctx.declare(p.name,{type:p.type,kind:"param"},p.line)); const body=this.parseBlock(false); this.ctx.leaveScope(); return node("Function",{name:id.lexeme,type,params},[body]);}
  parseDeclaration(needSemi=true){const type=this.typeToken(); const id=this.consume("ID","identifier"); let arraySize=null, init=null; if(this.match("LBK")){this.consume("LBK","["); const n=this.consume("NUM","array size"); arraySize=parseInt(n.lexeme||"0",10); this.consume("RBK","]");}
    const sym=this.ctx.declare(id.lexeme,{type,kind:arraySize?"array":"var",arraySize},id.line);
    if(this.match("ASG")){this.consume("ASG","="); init=this.parseExpression(); this.checkAssign(type,init.type,id.line); this.ctx.emit("=",init.place,"",sym.addr);}
    if(needSemi)this.consume("SCO",";");
    this.ctx.trace.push(`reduce Decl -> ${type} ${id.lexeme}${init?" = Expr":""}`);
    return node("Decl",{name:id.lexeme,type,scope:this.ctx.currentScopeName(),addr:sym.addr,line:id.line,arraySize},init?[init.ast]:[]);
  }
  parseStatement(){ if(this.isType()) return this.parseDeclaration(true); if(this.match("LBR")) return this.parseBlock(true); if(this.match("IF")) return this.parseIf(); if(this.match("WHILE")) return this.parseWhile(); if(this.match("RETURN")) return this.parseReturn(); if(this.match("PRINT")) return this.parsePrint(); if(this.match("INPUT")) return this.parseInput(); if(this.match("ID")) return this.parseAssignmentOrCallStmt(); const t=this.peek(); this.ctx.err(`unexpected token '${t.lexeme}'`,t.line); this.i++; return node("Error",{line:t.line}); }
  parseBlock(createScope=true){const start=this.consume("LBR","{"); if(createScope)this.ctx.enterScope("block"); const stmts=[]; while(!this.match("RBR")&&!this.match("EOF"))stmts.push(this.parseStatement()); this.consume("RBR","}"); const sc=this.ctx.currentScopeName(); if(createScope)this.ctx.leaveScope(); return node("Block",{scope:sc,line:start.line},stmts);}
  parseAssignmentOrCallStmt(){const id=this.consume("ID","identifier"); if(this.match("LPAR")){const call=this.finishCall(id); this.consume("SCO",";"); return call.ast;} let op="="; if(this.match("ASG")){this.consume("ASG","=");} else if(this.match("AAS")){op="+=";this.consume("AAS","+=");} else {this.ctx.err("expected assignment operator or function call",id.line);} const rhs=this.parseExpression(); this.consume("SCO",";"); const sym=this.ctx.lookup(id.lexeme); if(!sym){this.ctx.err(`undeclared variable: '${id.lexeme}'`,id.line);} else {const exprType=op==="+="?this.numericResult(sym.type,rhs.type,id.line):rhs.type; this.checkAssign(sym.type,{type:exprType},id.line); this.ctx.emit(op,rhs.place,"",sym.addr);}
    this.ctx.trace.push(`reduce Assign -> ${id.lexeme} ${op} Expr`);
    return node("Assign",{name:id.lexeme,op,type:sym?sym.type:"error",line:id.line},[rhs.ast]);}
  parsePrint(){const t=this.consume("PRINT","print"); this.consume("LPAR","("); const expr=this.parseExpression(); this.consume("RPAR",")"); this.consume("SCO",";"); this.ctx.emit("print",expr.place,"",""); this.ctx.trace.push("reduce Print -> print(Expr)"); return node("Print",{line:t.line},[expr.ast]);}
  parseInput(){const t=this.consume("INPUT","input"); this.consume("LPAR","("); const id=this.consume("ID","identifier"); this.consume("RPAR",")"); this.consume("SCO",";"); const sym=this.ctx.lookup(id.lexeme); if(!sym)this.ctx.err(`undeclared variable: '${id.lexeme}'`,id.line); else this.ctx.emit("input","","",sym.addr); return node("Input",{name:id.lexeme,line:t.line});}
  parseReturn(){const t=this.consume("RETURN","return"); let expr=null; if(!this.match("SCO"))expr=this.parseExpression(); this.consume("SCO",";"); this.ctx.emit("return",expr?expr.place:"","",""); return node("Return",{line:t.line},expr?[expr.ast]:[]);}
  parseIf(){const t=this.consume("IF","if"); this.consume("LPAR","("); const cond=this.parseExpression(); this.consume("RPAR",")"); if(cond.type!=="bool"&&cond.type!=="error")this.ctx.warn("condition expression is numeric; converted to bool",t.line); const elseLabel=this.ctx.label(),endLabel=this.ctx.label(); this.ctx.emit("ifFalse",cond.place,"",elseLabel); const thenNode=this.parseStatement(); this.ctx.emit("goto","","",endLabel); this.ctx.emit("label","","",elseLabel); let elseNode=null; if(this.match("ELSE")){this.consume("ELSE","else"); elseNode=this.parseStatement();} this.ctx.emit("label","","",endLabel); return node("If",{line:t.line},elseNode?[cond.ast,thenNode,elseNode]:[cond.ast,thenNode]);}
  parseWhile(){const t=this.consume("WHILE","while"); const start=this.ctx.label(),end=this.ctx.label(); this.ctx.emit("label","","",start); this.consume("LPAR","("); const cond=this.parseExpression(); this.consume("RPAR",")"); if(cond.type!=="bool"&&cond.type!=="error")this.ctx.warn("while condition is numeric; converted to bool",t.line); this.ctx.emit("ifFalse",cond.place,"",end); const body=this.parseStatement(); this.ctx.emit("goto","","",start); this.ctx.emit("label","","",end); return node("While",{line:t.line},[cond.ast,body]);}
  parseExpression(){return this.parseLogicalOr();}
  parseLogicalOr(){let left=this.parseLogicalAnd(); while(this.match("BOP","||")){const op=this.consume("BOP").lexeme; const right=this.parseLogicalAnd(); left=this.makeBinary(op,left,right,"bool");} return left;}
  parseLogicalAnd(){let left=this.parseEquality(); while(this.match("BOP","&&")){const op=this.consume("BOP").lexeme; const right=this.parseEquality(); left=this.makeBinary(op,left,right,"bool");} return left;}
  parseEquality(){let left=this.parseRelational(); while(this.match("ROP")&&["==","!="].includes(this.peek().lexeme)){const op=this.consume("ROP").lexeme; const right=this.parseRelational(); left=this.makeBinary(op,left,right,"bool");} return left;}
  parseRelational(){let left=this.parseAdditive(); while(this.match("ROP")&&["<","<=",">",">="].includes(this.peek().lexeme)){const op=this.consume("ROP").lexeme; const right=this.parseAdditive(); left=this.makeBinary(op,left,right,"bool");} return left;}
  parseAdditive(){let left=this.parseMultiplicative(); while(this.match("ADD")||this.match("SUB")){const op=this.consume(this.peek().type).lexeme; const right=this.parseMultiplicative(); left=this.makeBinary(op,left,right,this.numericResult(left.type,right.type,this.peek().line));} return left;}
  parseMultiplicative(){let left=this.parseUnary(); while(this.match("MUL")||this.match("DIV")){const op=this.consume(this.peek().type).lexeme; const right=this.parseUnary(); left=this.makeBinary(op,left,right,this.numericResult(left.type,right.type,this.peek().line));} return left;}
  parseUnary(){if(this.match("SUB")){const op=this.consume("SUB"); const e=this.parseUnary(); return {type:e.type,place:e.place,ast:node("UnaryExpr",{op:"-",type:e.type,line:op.line},[e.ast])};} if(this.match("NOT")){const op=this.consume("NOT"); const e=this.parseUnary(); const tmp=this.ctx.temp("bool"); this.ctx.emit("!",e.place,"",tmp.place); return {type:"bool",place:tmp.place,ast:node("UnaryExpr",{op:"!",type:"bool",line:op.line},[e.ast])};} return this.parsePrimary();}
  parsePrimary(){const t=this.peek(); if(this.match("NUM")){this.i++; return {type:"int",place:t.lexeme,ast:node("IntLiteral",{value:t.lexeme,type:"int",line:t.line})};} if(this.match("FLO")){this.i++; return {type:"float",place:t.lexeme,ast:node("FloatLiteral",{value:t.lexeme,type:"float",line:t.line})};} if(this.match("ID")){const id=this.consume("ID"); if(this.match("LPAR")) return this.finishCall(id); const sym=this.ctx.lookup(id.lexeme); if(!sym){this.ctx.err(`undeclared variable: '${id.lexeme}'`,id.line); return {type:"error",place:id.lexeme,ast:node("Identifier",{name:id.lexeme,type:"error",line:id.line})};} return {type:sym.type,place:sym.addr,ast:node("Identifier",{name:id.lexeme,type:sym.type,scope:sym.scope,addr:sym.addr,line:id.line})};} if(this.match("LPAR")){this.consume("LPAR","("); const e=this.parseExpression(); this.consume("RPAR",")"); return e;} this.ctx.err(`invalid expression near '${t.lexeme}'`,t.line); this.i++; return {type:"error",place:"?",ast:node("ErrorExpr",{line:t.line})};}
  finishCall(id){this.consume("LPAR","("); const args=[]; if(!this.match("RPAR")){do{args.push(this.parseExpression()); if(!this.match("CMA"))break; this.consume("CMA",",");}while(!this.match("RPAR"));} this.consume("RPAR",")"); const fn=this.ctx.lookupGlobal(id.lexeme); let ret="error"; if(!fn||fn.kind!=="function")this.ctx.err(`undeclared function: '${id.lexeme}'`,id.line); else{ret=fn.type; if(args.length!==fn.params.length)this.ctx.err(`function '${id.lexeme}' expects ${fn.params.length} arguments, got ${args.length}`,id.line); args.forEach((a,idx)=>{const p=fn.params[idx]; if(p)this.checkAssign(p.type,a,id.line);});} const tmp=this.ctx.temp(ret); this.ctx.emit("call",id.lexeme,args.map(a=>a.place).join(", "),tmp.place); return {type:ret,place:tmp.place,ast:node("Call",{name:id.lexeme,type:ret,line:id.line},args.map(a=>a.ast))};}
  numericResult(a,b,line){if(a==="error"||b==="error")return "error"; if(!["int","float"].includes(a)||!["int","float"].includes(b)){this.ctx.err(`operator requires numeric operands, got ${a} and ${b}`,line); return "error";} return a==="float"||b==="float"?"float":"int";}
  checkAssign(target,expr,line){if(target==="error"||expr.type==="error")return; if(target===expr.type)return; if(target==="float"&&expr.type==="int"){this.ctx.warn(`implicit conversion int -> float`,line); return;} this.ctx.err(`type mismatch: cannot assign ${expr.type} to ${target}`,line);}
  makeBinary(op,left,right,type){const tmp=this.ctx.temp(type); this.ctx.emit(op,left.place,right.place,tmp.place); this.ctx.trace.push(`reduce BinaryExpr -> Expr ${op} Expr : ${type}`); return {type,place:tmp.place,ast:node("BinaryExpr",{op,type,place:tmp.place},[left.ast,right.ast])};}
}

function runAnalysis(){
  const tokens=tokenize(sourceInput.value); renderTokens(tokens); const ctx=new SemanticContext(); let ast;
  try{ ast=new Parser(tokens,ctx).parseProgram(); }catch(e){ ctx.err(`internal parser error: ${e.message}`, tokens[Math.min(tokens.length-1,0)]?.line||1); ast=node("Program",{},[]); }
  renderTrace(ctx.trace); renderAST(ast); renderSymbols(ctx); renderScopes(ctx); renderErrors(ctx); renderIR(ctx.ir);
  updateMetrics(countNodes(ast), ctx.allScopes.length, ctx.allScopes.reduce((n,s)=>n+s.symbols.size,0), ctx.errors.length, ctx.warnings.length);
}
function renderTrace(trace){traceList.innerHTML=""; traceList.className="trace-list"; if(trace.length===0){setEmpty(traceList,"trace-list empty","No semantic action generated."); return;} trace.forEach((x,i)=>{const div=document.createElement("div"); div.className="trace-item"; div.innerHTML=`<strong>#${i+1}</strong> ${escapeHTML(x)}`; traceList.appendChild(div);});}
function renderAST(ast){astView.innerHTML=""; astView.className="tree-view"; astView.appendChild(astNodeHTML(ast));}
function astNodeHTML(n){const div=document.createElement("div"); div.className="tree-node"; const meta=Object.entries(n).filter(([k,v])=>k!=="children"&&k!=="kind"&&v!==undefined&&v!==null&&v!=="").map(([k,v])=>`${k}=${Array.isArray(v)?JSON.stringify(v):v}`).join(", "); div.innerHTML=`<div><span class="tree-title">${escapeHTML(n.kind)}</span> <span class="tree-meta">${escapeHTML(meta)}</span></div>`; if(n.children&&n.children.length){const c=document.createElement("div"); c.className="children"; n.children.forEach(ch=>c.appendChild(astNodeHTML(ch))); div.appendChild(c);} return div;}
function renderSymbols(ctx){const rows=[]; ctx.allScopes.forEach(s=>s.symbols.forEach(sym=>rows.push(sym))); if(rows.length===0){setEmpty(symbolTable,"table-wrap empty","No symbols."); return;} symbolTable.className="table-wrap"; symbolTable.innerHTML=`<table class="semantic-table"><thead><tr><th>Name</th><th>Kind</th><th>Type</th><th>Scope</th><th>Addr</th><th>Size</th><th>Line</th><th>Extra</th></tr></thead><tbody>${rows.map(s=>`<tr><td><strong>${escapeHTML(s.name)}</strong></td><td>${escapeHTML(s.kind)}</td><td>${escapeHTML(s.type)}</td><td class="scope-name">${escapeHTML(s.scope)}</td><td class="addr">${escapeHTML(s.addr)}</td><td>${s.size}</td><td>${s.line}</td><td>${s.params?.length?escapeHTML(s.params.map(p=>p.type+" "+p.name).join(", ")):(s.arraySize?"array["+s.arraySize+"]":"")}</td></tr>`).join("")}</tbody></table>`;}
function renderScopes(ctx){scopeTree.innerHTML=""; scopeTree.className="tree-view"; if(!ctx.allScopes[0]){setEmpty(scopeTree,"tree-view empty","No scopes.");return;} scopeTree.appendChild(scopeNode(ctx.allScopes[0]));}
function scopeNode(s){const div=document.createElement("div"); div.className="tree-node"; div.innerHTML=`<div><span class="tree-title">${escapeHTML(s.name)}</span> <span class="tree-meta">kind=${s.kind}, parent=${s.parent===null?"none":s.parent}, symbols=${s.symbols.size}, frameSize=${s.offset}</span></div>`; if(s.children.length){const c=document.createElement("div"); c.className="children"; s.children.forEach(ch=>c.appendChild(scopeNode(ch))); div.appendChild(c);} return div;}
function renderErrors(ctx){errorList.innerHTML=""; errorList.className="error-list"; if(ctx.errors.length===0&&ctx.warnings.length===0){errorStatus.textContent="Semantic Safe"; errorStatus.className="tag success"; const div=document.createElement("div"); div.className="error-item safe"; div.innerHTML="<strong>No semantic error detected.</strong><div class='tree-meta'>The current program passed declaration, reference, scope, and type checks.</div>"; errorList.appendChild(div); return;} errorStatus.textContent=ctx.errors.length?"Semantic Error":"Warnings Only"; errorStatus.className=ctx.errors.length?"tag danger":"tag"; ctx.errors.forEach(e=>{const div=document.createElement("div"); div.className="error-item"; div.innerHTML=`<strong>Error line ${e.line}</strong><div>${escapeHTML(e.msg)}</div>`; errorList.appendChild(div);}); ctx.warnings.forEach(w=>{const div=document.createElement("div"); div.className="error-item warning"; div.innerHTML=`<strong>Warning line ${w.line}</strong><div>${escapeHTML(w.msg)}</div>`; errorList.appendChild(div);});}
function renderIR(ir){irList.innerHTML=""; irList.className="ir-list"; if(ir.length===0){setEmpty(irList,"ir-list empty","No IR generated."); return;} ir.forEach((q,i)=>{const div=document.createElement("div"); div.className="ir-item"; div.textContent=`${String(i).padStart(2,"0")}: (${q.op}, ${q.a1}, ${q.a2}, ${q.res})`; irList.appendChild(div);});}
function countNodes(n){return 1+(n.children||[]).reduce((sum,c)=>sum+countNodes(c),0);}
runAnalysis();
