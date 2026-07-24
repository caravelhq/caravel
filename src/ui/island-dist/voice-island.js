var __defProp = Object.defineProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
/**
* @vue/shared v3.5.40
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
// @__NO_SIDE_EFFECTS__
function makeMap(str) {
  const map = /* @__PURE__ */ Object.create(null);
  for (const key of str.split(",")) map[key] = 1;
  return (val) => val in map;
}
const EMPTY_OBJ = {};
const EMPTY_ARR = [];
const NOOP = () => {
};
const NO = () => false;
const isOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // uppercase letter
(key.charCodeAt(2) > 122 || key.charCodeAt(2) < 97);
const isModelListener = (key) => key.startsWith("onUpdate:");
const extend = Object.assign;
const remove = (arr, el) => {
  const i = arr.indexOf(el);
  if (i > -1) {
    arr.splice(i, 1);
  }
};
const hasOwnProperty$1 = Object.prototype.hasOwnProperty;
const hasOwn = (val, key) => hasOwnProperty$1.call(val, key);
const isArray = Array.isArray;
const isMap = (val) => toTypeString(val) === "[object Map]";
const isSet = (val) => toTypeString(val) === "[object Set]";
const isDate = (val) => toTypeString(val) === "[object Date]";
const isRegExp = (val) => toTypeString(val) === "[object RegExp]";
const isFunction = (val) => typeof val === "function";
const isString = (val) => typeof val === "string";
const isSymbol = (val) => typeof val === "symbol";
const isObject$2 = (val) => val !== null && typeof val === "object";
const isPromise = (val) => {
  return (isObject$2(val) || isFunction(val)) && isFunction(val.then) && isFunction(val.catch);
};
const objectToString = Object.prototype.toString;
const toTypeString = (value) => objectToString.call(value);
const toRawType = (value) => {
  return toTypeString(value).slice(8, -1);
};
const isPlainObject$1 = (val) => toTypeString(val) === "[object Object]";
const isIntegerKey = (key) => isString(key) && key !== "NaN" && key[0] !== "-" && "" + parseInt(key, 10) === key;
const isReservedProp = /* @__PURE__ */ makeMap(
  // the leading comma is intentional so empty string "" is also included
  ",key,ref,ref_for,ref_key,onVnodeBeforeMount,onVnodeMounted,onVnodeBeforeUpdate,onVnodeUpdated,onVnodeBeforeUnmount,onVnodeUnmounted"
);
const cacheStringFunction = (fn) => {
  const cache = /* @__PURE__ */ Object.create(null);
  return ((str) => {
    const hit = cache[str];
    return hit || (cache[str] = fn(str));
  });
};
const camelizeRE = /-\w/g;
const camelize = cacheStringFunction(
  (str) => {
    return str.replace(camelizeRE, (c) => c.slice(1).toUpperCase());
  }
);
const hyphenateRE = /\B([A-Z])/g;
const hyphenate = cacheStringFunction(
  (str) => str.replace(hyphenateRE, "-$1").toLowerCase()
);
const capitalize = cacheStringFunction((str) => {
  return str.charAt(0).toUpperCase() + str.slice(1);
});
const toHandlerKey = cacheStringFunction(
  (str) => {
    const s = str ? `on${capitalize(str)}` : ``;
    return s;
  }
);
const hasChanged = (value, oldValue) => !Object.is(value, oldValue);
const invokeArrayFns = (fns, ...arg) => {
  for (let i = 0; i < fns.length; i++) {
    fns[i](...arg);
  }
};
const def = (obj, key, value, writable = false) => {
  Object.defineProperty(obj, key, {
    configurable: true,
    enumerable: false,
    writable,
    value
  });
};
const looseToNumber = (val) => {
  const n = parseFloat(val);
  return isNaN(n) ? val : n;
};
const toNumber = (val) => {
  const n = isString(val) ? Number(val) : NaN;
  return isNaN(n) ? val : n;
};
let _globalThis;
const getGlobalThis = () => {
  return _globalThis || (_globalThis = typeof globalThis !== "undefined" ? globalThis : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : {});
};
const GLOBALS_ALLOWED = "Infinity,undefined,NaN,isFinite,isNaN,parseFloat,parseInt,decodeURI,decodeURIComponent,encodeURI,encodeURIComponent,Math,Number,Date,Array,Object,Boolean,String,RegExp,Map,Set,JSON,Intl,BigInt,console,Error,Symbol";
const isGloballyAllowed = /* @__PURE__ */ makeMap(GLOBALS_ALLOWED);
function normalizeStyle(value) {
  if (isArray(value)) {
    const res = {};
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      const normalized = isString(item) ? parseStringStyle(item) : normalizeStyle(item);
      if (normalized) {
        for (const key in normalized) {
          res[key] = normalized[key];
        }
      }
    }
    return res;
  } else if (isString(value) || isObject$2(value)) {
    return value;
  }
}
const listDelimiterRE = /;(?![^(]*\))/g;
const propertyDelimiterRE = /:([^]+)/;
const styleCommentRE = /\/\*[^]*?\*\//g;
function parseStringStyle(cssText) {
  const ret = {};
  cssText.replace(styleCommentRE, "").split(listDelimiterRE).forEach((item) => {
    if (item) {
      const tmp = item.split(propertyDelimiterRE);
      tmp.length > 1 && (ret[tmp[0].trim()] = tmp[1].trim());
    }
  });
  return ret;
}
function normalizeClass(value) {
  let res = "";
  if (isString(value)) {
    res = value;
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const normalized = normalizeClass(value[i]);
      if (normalized) {
        res += normalized + " ";
      }
    }
  } else if (isObject$2(value)) {
    for (const name in value) {
      if (value[name]) {
        res += name + " ";
      }
    }
  }
  return res.trim();
}
function normalizeProps(props) {
  if (!props) return null;
  let { class: klass, style } = props;
  if (klass && !isString(klass)) {
    props.class = normalizeClass(klass);
  }
  if (style) {
    props.style = normalizeStyle(style);
  }
  return props;
}
const specialBooleanAttrs = `itemscope,allowfullscreen,formnovalidate,ismap,nomodule,novalidate,readonly`;
const isSpecialBooleanAttr = /* @__PURE__ */ makeMap(specialBooleanAttrs);
function includeBooleanAttr(value) {
  return !!value || value === "";
}
function looseCompareArrays(a, b) {
  if (a.length !== b.length) return false;
  let equal = true;
  for (let i = 0; equal && i < a.length; i++) {
    equal = looseEqual(a[i], b[i]);
  }
  return equal;
}
function looseEqual(a, b) {
  if (a === b) return true;
  let aValidType = isDate(a);
  let bValidType = isDate(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? a.getTime() === b.getTime() : false;
  }
  aValidType = isSymbol(a);
  bValidType = isSymbol(b);
  if (aValidType || bValidType) {
    return a === b;
  }
  aValidType = isArray(a);
  bValidType = isArray(b);
  if (aValidType || bValidType) {
    return aValidType && bValidType ? looseCompareArrays(a, b) : false;
  }
  aValidType = isObject$2(a);
  bValidType = isObject$2(b);
  if (aValidType || bValidType) {
    if (!aValidType || !bValidType) {
      return false;
    }
    const aKeysCount = Object.keys(a).length;
    const bKeysCount = Object.keys(b).length;
    if (aKeysCount !== bKeysCount) {
      return false;
    }
    for (const key in a) {
      const aHasKey = a.hasOwnProperty(key);
      const bHasKey = b.hasOwnProperty(key);
      if (aHasKey && !bHasKey || !aHasKey && bHasKey || !looseEqual(a[key], b[key])) {
        return false;
      }
    }
  }
  return String(a) === String(b);
}
function looseIndexOf(arr, val) {
  return arr.findIndex((item) => looseEqual(item, val));
}
const isRef$1 = (val) => {
  return !!(val && val["__v_isRef"] === true);
};
const toDisplayString = (val) => {
  return isString(val) ? val : val == null ? "" : isArray(val) || isObject$2(val) && (val.toString === objectToString || !isFunction(val.toString)) ? isRef$1(val) ? toDisplayString(val.value) : JSON.stringify(val, replacer, 2) : String(val);
};
const replacer = (_key, val) => {
  if (isRef$1(val)) {
    return replacer(_key, val.value);
  } else if (isMap(val)) {
    return {
      [`Map(${val.size})`]: [...val.entries()].reduce(
        (entries, [key, val2], i) => {
          entries[stringifySymbol(key, i) + " =>"] = val2;
          return entries;
        },
        {}
      )
    };
  } else if (isSet(val)) {
    return {
      [`Set(${val.size})`]: [...val.values()].map((v) => stringifySymbol(v))
    };
  } else if (isSymbol(val)) {
    return stringifySymbol(val);
  } else if (isObject$2(val) && !isArray(val) && !isPlainObject$1(val)) {
    return String(val);
  }
  return val;
};
const stringifySymbol = (v, i = "") => {
  var _a;
  return (
    // Symbol.description in es2019+ so we need to cast here to pass
    // the lib: es2016 check
    isSymbol(v) ? `Symbol(${(_a = v.description) != null ? _a : i})` : v
  );
};
function normalizeCssVarValue(value) {
  if (value == null) {
    return "initial";
  }
  if (typeof value === "string") {
    return value === "" ? " " : value;
  }
  return String(value);
}
/**
* @vue/reactivity v3.5.40
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let activeEffectScope;
class EffectScope {
  // TODO isolatedDeclarations "__v_skip"
  constructor(detached = false) {
    this.detached = detached;
    this._active = true;
    this._on = 0;
    this.effects = [];
    this.cleanups = [];
    this._isPaused = false;
    this._warnOnRun = true;
    this.__v_skip = true;
    if (!detached && activeEffectScope) {
      if (activeEffectScope.active) {
        this.parent = activeEffectScope;
        this.index = (activeEffectScope.scopes || (activeEffectScope.scopes = [])).push(
          this
        ) - 1;
      } else {
        this._active = false;
        this._warnOnRun = false;
      }
    }
  }
  get active() {
    return this._active;
  }
  pause() {
    if (this._active) {
      this._isPaused = true;
      let i, l;
      if (this.scopes) {
        const scopes = this.scopes.slice();
        for (i = 0, l = scopes.length; i < l; i++) {
          scopes[i].pause();
        }
      }
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].pause();
      }
    }
  }
  /**
   * Resumes the effect scope, including all child scopes and effects.
   */
  resume() {
    if (this._active) {
      if (this._isPaused) {
        this._isPaused = false;
        let i, l;
        if (this.scopes) {
          const scopes = this.scopes.slice();
          for (i = 0, l = scopes.length; i < l; i++) {
            scopes[i].resume();
          }
        }
        const effects = this.effects.slice();
        for (i = 0, l = effects.length; i < l; i++) {
          effects[i].resume();
        }
      }
    }
  }
  run(fn) {
    if (this._active) {
      const currentEffectScope = activeEffectScope;
      try {
        activeEffectScope = this;
        return fn();
      } finally {
        activeEffectScope = currentEffectScope;
      }
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  on() {
    if (++this._on === 1) {
      this.prevScope = activeEffectScope;
      activeEffectScope = this;
    }
  }
  /**
   * This should only be called on non-detached scopes
   * @internal
   */
  off() {
    if (this._on > 0 && --this._on === 0) {
      if (activeEffectScope === this) {
        activeEffectScope = this.prevScope;
      } else {
        let current = activeEffectScope;
        while (current) {
          if (current.prevScope === this) {
            current.prevScope = this.prevScope;
            break;
          }
          current = current.prevScope;
        }
      }
      this.prevScope = void 0;
    }
  }
  stop(fromParent) {
    if (this._active) {
      this._active = false;
      let i, l;
      for (i = 0, l = this.effects.length; i < l; i++) {
        this.effects[i].stop();
      }
      this.effects.length = 0;
      for (i = 0, l = this.cleanups.length; i < l; i++) {
        this.cleanups[i]();
      }
      this.cleanups.length = 0;
      if (this.scopes) {
        const scopes = this.scopes.slice();
        for (i = 0, l = scopes.length; i < l; i++) {
          scopes[i].stop(true);
        }
        this.scopes.length = 0;
      }
      if (!this.detached && this.parent && !fromParent) {
        const last = this.parent.scopes.pop();
        if (last && last !== this) {
          this.parent.scopes[this.index] = last;
          last.index = this.index;
        }
      }
      this.parent = void 0;
    }
  }
}
function effectScope(detached) {
  return new EffectScope(detached);
}
function getCurrentScope() {
  return activeEffectScope;
}
function onScopeDispose(fn, failSilently = false) {
  if (activeEffectScope) {
    activeEffectScope.cleanups.push(fn);
  }
}
let activeSub;
const pausedQueueEffects = /* @__PURE__ */ new WeakSet();
class ReactiveEffect {
  constructor(fn) {
    this.fn = fn;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 1 | 4;
    this.next = void 0;
    this.cleanup = void 0;
    this.scheduler = void 0;
    if (activeEffectScope) {
      if (activeEffectScope.active) {
        activeEffectScope.effects.push(this);
      } else {
        this.flags &= -2;
      }
    }
  }
  pause() {
    this.flags |= 64;
  }
  resume() {
    if (this.flags & 64) {
      this.flags &= -65;
      if (pausedQueueEffects.has(this)) {
        pausedQueueEffects.delete(this);
        this.trigger();
      }
    }
  }
  /**
   * @internal
   */
  notify() {
    if (this.flags & 2 && !(this.flags & 32)) {
      return;
    }
    if (!(this.flags & 8)) {
      batch(this);
    }
  }
  run() {
    if (!(this.flags & 1)) {
      return this.fn();
    }
    this.flags |= 2;
    cleanupEffect(this);
    prepareDeps(this);
    const prevEffect = activeSub;
    const prevShouldTrack = shouldTrack;
    activeSub = this;
    shouldTrack = true;
    try {
      return this.fn();
    } finally {
      cleanupDeps(this);
      activeSub = prevEffect;
      shouldTrack = prevShouldTrack;
      this.flags &= -3;
    }
  }
  stop() {
    if (this.flags & 1) {
      for (let link = this.deps; link; link = link.nextDep) {
        removeSub(link);
      }
      this.deps = this.depsTail = void 0;
      cleanupEffect(this);
      this.onStop && this.onStop();
      this.flags &= -2;
    }
  }
  trigger() {
    if (this.flags & 64) {
      pausedQueueEffects.add(this);
    } else if (this.scheduler) {
      this.scheduler();
    } else {
      this.runIfDirty();
    }
  }
  /**
   * @internal
   */
  runIfDirty() {
    if (isDirty(this)) {
      this.run();
    }
  }
  get dirty() {
    return isDirty(this);
  }
}
let batchDepth = 0;
let batchedSub;
let batchedComputed;
function batch(sub, isComputed2 = false) {
  sub.flags |= 8;
  if (isComputed2) {
    sub.next = batchedComputed;
    batchedComputed = sub;
    return;
  }
  sub.next = batchedSub;
  batchedSub = sub;
}
function startBatch() {
  batchDepth++;
}
function endBatch() {
  if (--batchDepth > 0) {
    return;
  }
  if (batchedComputed) {
    let e = batchedComputed;
    batchedComputed = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      e = next;
    }
  }
  let error;
  while (batchedSub) {
    let e = batchedSub;
    batchedSub = void 0;
    while (e) {
      const next = e.next;
      e.next = void 0;
      e.flags &= -9;
      if (e.flags & 1) {
        try {
          ;
          e.trigger();
        } catch (err) {
          if (!error) error = err;
        }
      }
      e = next;
    }
  }
  if (error) throw error;
}
function prepareDeps(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    link.version = -1;
    link.prevActiveLink = link.dep.activeLink;
    link.dep.activeLink = link;
  }
}
function cleanupDeps(sub) {
  let head;
  let tail = sub.depsTail;
  let link = tail;
  while (link) {
    const prev = link.prevDep;
    if (link.version === -1) {
      if (link === tail) tail = prev;
      removeSub(link);
      removeDep(link);
    } else {
      head = link;
    }
    link.dep.activeLink = link.prevActiveLink;
    link.prevActiveLink = void 0;
    link = prev;
  }
  sub.deps = head;
  sub.depsTail = tail;
}
function isDirty(sub) {
  for (let link = sub.deps; link; link = link.nextDep) {
    if (link.dep.version !== link.version || link.dep.computed && (refreshComputed(link.dep.computed) || link.dep.version !== link.version)) {
      return true;
    }
  }
  if (sub._dirty) {
    return true;
  }
  return false;
}
function refreshComputed(computed2) {
  if (computed2.flags & 4 && !(computed2.flags & 16)) {
    return;
  }
  computed2.flags &= -17;
  if (computed2.globalVersion === globalVersion) {
    return;
  }
  computed2.globalVersion = globalVersion;
  if (!computed2.isSSR && computed2.flags & 128 && (!computed2.deps && !computed2._dirty || !isDirty(computed2))) {
    return;
  }
  computed2.flags |= 2;
  const dep = computed2.dep;
  const prevSub = activeSub;
  const prevShouldTrack = shouldTrack;
  activeSub = computed2;
  shouldTrack = true;
  try {
    prepareDeps(computed2);
    const value = computed2.fn(computed2._value);
    if (dep.version === 0 || hasChanged(value, computed2._value)) {
      computed2.flags |= 128;
      computed2._value = value;
      dep.version++;
    }
  } catch (err) {
    dep.version++;
    throw err;
  } finally {
    activeSub = prevSub;
    shouldTrack = prevShouldTrack;
    cleanupDeps(computed2);
    computed2.flags &= -3;
  }
}
function removeSub(link, soft = false) {
  const { dep, prevSub, nextSub } = link;
  if (prevSub) {
    prevSub.nextSub = nextSub;
    link.prevSub = void 0;
  }
  if (nextSub) {
    nextSub.prevSub = prevSub;
    link.nextSub = void 0;
  }
  if (dep.subs === link) {
    dep.subs = prevSub;
    if (!prevSub && dep.computed) {
      dep.computed.flags &= -5;
      for (let l = dep.computed.deps; l; l = l.nextDep) {
        removeSub(l, true);
      }
    }
  }
  if (!soft && !--dep.sc && dep.map) {
    dep.map.delete(dep.key);
  }
}
function removeDep(link) {
  const { prevDep, nextDep } = link;
  if (prevDep) {
    prevDep.nextDep = nextDep;
    link.prevDep = void 0;
  }
  if (nextDep) {
    nextDep.prevDep = prevDep;
    link.nextDep = void 0;
  }
}
function effect(fn, options) {
  if (fn.effect instanceof ReactiveEffect) {
    fn = fn.effect.fn;
  }
  const e = new ReactiveEffect(fn);
  if (options) {
    extend(e, options);
  }
  try {
    e.run();
  } catch (err) {
    e.stop();
    throw err;
  }
  const runner = e.run.bind(e);
  runner.effect = e;
  return runner;
}
function stop(runner) {
  runner.effect.stop();
}
let shouldTrack = true;
const trackStack = [];
function pauseTracking() {
  trackStack.push(shouldTrack);
  shouldTrack = false;
}
function resetTracking() {
  const last = trackStack.pop();
  shouldTrack = last === void 0 ? true : last;
}
function cleanupEffect(e) {
  const { cleanup } = e;
  e.cleanup = void 0;
  if (cleanup) {
    const prevSub = activeSub;
    activeSub = void 0;
    try {
      cleanup();
    } finally {
      activeSub = prevSub;
    }
  }
}
let globalVersion = 0;
class Link {
  constructor(sub, dep) {
    this.sub = sub;
    this.dep = dep;
    this.version = dep.version;
    this.nextDep = this.prevDep = this.nextSub = this.prevSub = this.prevActiveLink = void 0;
  }
}
class Dep {
  // TODO isolatedDeclarations "__v_skip"
  constructor(computed2) {
    this.computed = computed2;
    this.version = 0;
    this.activeLink = void 0;
    this.subs = void 0;
    this.map = void 0;
    this.key = void 0;
    this.sc = 0;
    this.__v_skip = true;
  }
  track(debugInfo) {
    if (!activeSub || !shouldTrack || activeSub === this.computed) {
      return;
    }
    let link = this.activeLink;
    if (link === void 0 || link.sub !== activeSub) {
      link = this.activeLink = new Link(activeSub, this);
      if (!activeSub.deps) {
        activeSub.deps = activeSub.depsTail = link;
      } else {
        link.prevDep = activeSub.depsTail;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
      }
      addSub(link);
    } else if (link.version === -1) {
      link.version = this.version;
      if (link.nextDep) {
        const next = link.nextDep;
        next.prevDep = link.prevDep;
        if (link.prevDep) {
          link.prevDep.nextDep = next;
        }
        link.prevDep = activeSub.depsTail;
        link.nextDep = void 0;
        activeSub.depsTail.nextDep = link;
        activeSub.depsTail = link;
        if (activeSub.deps === link) {
          activeSub.deps = next;
        }
      }
    }
    return link;
  }
  trigger(debugInfo) {
    this.version++;
    globalVersion++;
    this.notify(debugInfo);
  }
  notify(debugInfo) {
    startBatch();
    try {
      if (false) ;
      for (let link = this.subs; link; link = link.prevSub) {
        if (link.sub.notify()) {
          ;
          link.sub.dep.notify();
        }
      }
    } finally {
      endBatch();
    }
  }
}
function addSub(link) {
  link.dep.sc++;
  if (link.sub.flags & 4) {
    const computed2 = link.dep.computed;
    if (computed2 && !link.dep.subs) {
      computed2.flags |= 4 | 16;
      for (let l = computed2.deps; l; l = l.nextDep) {
        addSub(l);
      }
    }
    const currentTail = link.dep.subs;
    if (currentTail !== link) {
      link.prevSub = currentTail;
      if (currentTail) currentTail.nextSub = link;
    }
    link.dep.subs = link;
  }
}
const targetMap = /* @__PURE__ */ new WeakMap();
const ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const MAP_KEY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
const ARRAY_ITERATE_KEY = /* @__PURE__ */ Symbol(
  ""
);
function track(target, type, key) {
  if (shouldTrack && activeSub) {
    let depsMap = targetMap.get(target);
    if (!depsMap) {
      targetMap.set(target, depsMap = /* @__PURE__ */ new Map());
    }
    let dep = depsMap.get(key);
    if (!dep) {
      depsMap.set(key, dep = new Dep());
      dep.map = depsMap;
      dep.key = key;
    }
    {
      dep.track();
    }
  }
}
function trigger(target, type, key, newValue, oldValue, oldTarget) {
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    globalVersion++;
    return;
  }
  const run = (dep) => {
    if (dep) {
      {
        dep.trigger();
      }
    }
  };
  startBatch();
  if (type === "clear") {
    depsMap.forEach(run);
  } else {
    const targetIsArray = isArray(target);
    const isArrayIndex = targetIsArray && isIntegerKey(key);
    if (targetIsArray && key === "length") {
      const newLength = Number(newValue);
      depsMap.forEach((dep, key2) => {
        if (key2 === "length" || key2 === ARRAY_ITERATE_KEY || !isSymbol(key2) && key2 >= newLength) {
          run(dep);
        }
      });
    } else {
      if (key !== void 0 || depsMap.has(void 0)) {
        run(depsMap.get(key));
      }
      if (isArrayIndex) {
        run(depsMap.get(ARRAY_ITERATE_KEY));
      }
      switch (type) {
        case "add":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          } else if (isArrayIndex) {
            run(depsMap.get("length"));
          }
          break;
        case "delete":
          if (!targetIsArray) {
            run(depsMap.get(ITERATE_KEY));
            if (isMap(target)) {
              run(depsMap.get(MAP_KEY_ITERATE_KEY));
            }
          }
          break;
        case "set":
          if (isMap(target)) {
            run(depsMap.get(ITERATE_KEY));
          }
          break;
      }
    }
  }
  endBatch();
}
function getDepFromReactive(object, key) {
  const depMap = targetMap.get(object);
  return depMap && depMap.get(key);
}
function reactiveReadArray(array) {
  const raw = /* @__PURE__ */ toRaw(array);
  if (raw === array) return raw;
  track(raw, "iterate", ARRAY_ITERATE_KEY);
  return /* @__PURE__ */ isShallow(array) ? raw : raw.map(toReactive);
}
function shallowReadArray(arr) {
  track(arr = /* @__PURE__ */ toRaw(arr), "iterate", ARRAY_ITERATE_KEY);
  return arr;
}
function toWrapped(target, item) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return /* @__PURE__ */ isReactive(target) ? toReadonly(toReactive(item)) : toReadonly(item);
  }
  return toReactive(item);
}
const arrayInstrumentations = {
  __proto__: null,
  [Symbol.iterator]() {
    return iterator(this, Symbol.iterator, (item) => toWrapped(this, item));
  },
  concat(...args) {
    return reactiveReadArray(this).concat(
      ...args.map((x) => isArray(x) ? reactiveReadArray(x) : x)
    );
  },
  entries() {
    return iterator(this, "entries", (value) => {
      value[1] = toWrapped(this, value[1]);
      return value;
    });
  },
  every(fn, thisArg) {
    return apply(this, "every", fn, thisArg, void 0, arguments);
  },
  filter(fn, thisArg) {
    return apply(
      this,
      "filter",
      fn,
      thisArg,
      (v) => v.map((item) => toWrapped(this, item)),
      arguments
    );
  },
  find(fn, thisArg) {
    return apply(
      this,
      "find",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findIndex(fn, thisArg) {
    return apply(this, "findIndex", fn, thisArg, void 0, arguments);
  },
  findLast(fn, thisArg) {
    return apply(
      this,
      "findLast",
      fn,
      thisArg,
      (item) => toWrapped(this, item),
      arguments
    );
  },
  findLastIndex(fn, thisArg) {
    return apply(this, "findLastIndex", fn, thisArg, void 0, arguments);
  },
  // flat, flatMap could benefit from ARRAY_ITERATE but are not straight-forward to implement
  forEach(fn, thisArg) {
    return apply(this, "forEach", fn, thisArg, void 0, arguments);
  },
  includes(...args) {
    return searchProxy(this, "includes", args);
  },
  indexOf(...args) {
    return searchProxy(this, "indexOf", args);
  },
  join(separator) {
    return reactiveReadArray(this).join(separator);
  },
  // keys() iterator only reads `length`, no optimization required
  lastIndexOf(...args) {
    return searchProxy(this, "lastIndexOf", args);
  },
  map(fn, thisArg) {
    return apply(this, "map", fn, thisArg, void 0, arguments);
  },
  pop() {
    return noTracking(this, "pop");
  },
  push(...args) {
    return noTracking(this, "push", args);
  },
  reduce(fn, ...args) {
    return reduce(this, "reduce", fn, args);
  },
  reduceRight(fn, ...args) {
    return reduce(this, "reduceRight", fn, args);
  },
  shift() {
    return noTracking(this, "shift");
  },
  // slice could use ARRAY_ITERATE but also seems to beg for range tracking
  some(fn, thisArg) {
    return apply(this, "some", fn, thisArg, void 0, arguments);
  },
  splice(...args) {
    return noTracking(this, "splice", args);
  },
  toReversed() {
    return reactiveReadArray(this).toReversed();
  },
  toSorted(comparer) {
    return reactiveReadArray(this).toSorted(comparer);
  },
  toSpliced(...args) {
    return reactiveReadArray(this).toSpliced(...args);
  },
  unshift(...args) {
    return noTracking(this, "unshift", args);
  },
  values() {
    return iterator(this, "values", (item) => toWrapped(this, item));
  }
};
function iterator(self2, method, wrapValue) {
  const arr = shallowReadArray(self2);
  const iter = arr[method]();
  if (arr !== self2 && !/* @__PURE__ */ isShallow(self2)) {
    iter._next = iter.next;
    iter.next = () => {
      const result = iter._next();
      if (!result.done) {
        result.value = wrapValue(result.value);
      }
      return result;
    };
  }
  return iter;
}
const arrayProto = Array.prototype;
function apply(self2, method, fn, thisArg, wrappedRetFn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  const methodFn = arr[method];
  if (methodFn !== arrayProto[method]) {
    const result2 = methodFn.apply(self2, args);
    return needsWrap ? toReactive(result2) : result2;
  }
  let wrappedFn = fn;
  if (arr !== self2) {
    if (needsWrap) {
      wrappedFn = function(item, index) {
        return fn.call(this, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 2) {
      wrappedFn = function(item, index) {
        return fn.call(this, item, index, self2);
      };
    }
  }
  const result = methodFn.call(arr, wrappedFn, thisArg);
  return needsWrap && wrappedRetFn ? wrappedRetFn(result) : result;
}
function reduce(self2, method, fn, args) {
  const arr = shallowReadArray(self2);
  const needsWrap = arr !== self2 && !/* @__PURE__ */ isShallow(self2);
  let wrappedFn = fn;
  let wrapInitialAccumulator = false;
  if (arr !== self2) {
    if (needsWrap) {
      wrapInitialAccumulator = args.length === 0;
      wrappedFn = function(acc, item, index) {
        if (wrapInitialAccumulator) {
          wrapInitialAccumulator = false;
          acc = toWrapped(self2, acc);
        }
        return fn.call(this, acc, toWrapped(self2, item), index, self2);
      };
    } else if (fn.length > 3) {
      wrappedFn = function(acc, item, index) {
        return fn.call(this, acc, item, index, self2);
      };
    }
  }
  const result = arr[method](wrappedFn, ...args);
  return wrapInitialAccumulator ? toWrapped(self2, result) : result;
}
function searchProxy(self2, method, args) {
  const arr = /* @__PURE__ */ toRaw(self2);
  track(arr, "iterate", ARRAY_ITERATE_KEY);
  const res = arr[method](...args);
  if ((res === -1 || res === false) && /* @__PURE__ */ isProxy(args[0])) {
    args[0] = /* @__PURE__ */ toRaw(args[0]);
    return arr[method](...args);
  }
  return res;
}
function noTracking(self2, method, args = []) {
  pauseTracking();
  startBatch();
  const res = (/* @__PURE__ */ toRaw(self2))[method].apply(self2, args);
  endBatch();
  resetTracking();
  return res;
}
const isNonTrackableKeys = /* @__PURE__ */ makeMap(`__proto__,__v_isRef,__isVue`);
const builtInSymbols = new Set(
  /* @__PURE__ */ Object.getOwnPropertyNames(Symbol).filter((key) => key !== "arguments" && key !== "caller").map((key) => Symbol[key]).filter(isSymbol)
);
function hasOwnProperty(key) {
  if (!isSymbol(key)) key = String(key);
  const obj = /* @__PURE__ */ toRaw(this);
  track(obj, "has", key);
  return obj.hasOwnProperty(key);
}
class BaseReactiveHandler {
  constructor(_isReadonly = false, _isShallow = false) {
    this._isReadonly = _isReadonly;
    this._isShallow = _isShallow;
  }
  get(target, key, receiver) {
    if (key === "__v_skip") return target["__v_skip"];
    const isReadonly2 = this._isReadonly, isShallow2 = this._isShallow;
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_isShallow") {
      return isShallow2;
    } else if (key === "__v_raw") {
      if (receiver === (isReadonly2 ? isShallow2 ? shallowReadonlyMap : readonlyMap : isShallow2 ? shallowReactiveMap : reactiveMap).get(target) || // receiver is not the reactive proxy, but has the same prototype
      // this means the receiver is a user proxy of the reactive proxy
      Object.getPrototypeOf(target) === Object.getPrototypeOf(receiver)) {
        return target;
      }
      return;
    }
    const targetIsArray = isArray(target);
    if (!isReadonly2) {
      let fn;
      if (targetIsArray && (fn = arrayInstrumentations[key])) {
        return fn;
      }
      if (key === "hasOwnProperty") {
        return hasOwnProperty;
      }
    }
    const res = Reflect.get(
      target,
      key,
      // if this is a proxy wrapping a ref, return methods using the raw ref
      // as receiver so that we don't have to call `toRaw` on the ref in all
      // its class methods
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (isSymbol(key) ? builtInSymbols.has(key) : isNonTrackableKeys(key)) {
      return res;
    }
    if (!isReadonly2) {
      track(target, "get", key);
    }
    if (isShallow2) {
      return res;
    }
    if (/* @__PURE__ */ isRef(res)) {
      const value = targetIsArray && isIntegerKey(key) ? res : res.value;
      return isReadonly2 && isObject$2(value) ? /* @__PURE__ */ readonly(value) : value;
    }
    if (isObject$2(res)) {
      return isReadonly2 ? /* @__PURE__ */ readonly(res) : /* @__PURE__ */ reactive(res);
    }
    return res;
  }
}
class MutableReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(false, isShallow2);
  }
  set(target, key, value, receiver) {
    let oldValue = target[key];
    const isArrayWithIntegerKey = isArray(target) && isIntegerKey(key);
    if (!this._isShallow) {
      const isOldValueReadonly = /* @__PURE__ */ isReadonly(oldValue);
      if (!/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
        oldValue = /* @__PURE__ */ toRaw(oldValue);
        value = /* @__PURE__ */ toRaw(value);
      }
      if (!isArrayWithIntegerKey && /* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
        if (isOldValueReadonly) {
          return true;
        } else {
          oldValue.value = value;
          return true;
        }
      }
    }
    const hadKey = isArrayWithIntegerKey ? Number(key) < target.length : hasOwn(target, key);
    const result = Reflect.set(
      target,
      key,
      value,
      /* @__PURE__ */ isRef(target) ? target : receiver
    );
    if (target === /* @__PURE__ */ toRaw(receiver) && result) {
      if (!hadKey) {
        trigger(target, "add", key, value);
      } else if (hasChanged(value, oldValue)) {
        trigger(target, "set", key, value);
      }
    }
    return result;
  }
  deleteProperty(target, key) {
    const hadKey = hasOwn(target, key);
    target[key];
    const result = Reflect.deleteProperty(target, key);
    if (result && hadKey) {
      trigger(target, "delete", key, void 0);
    }
    return result;
  }
  has(target, key) {
    const result = Reflect.has(target, key);
    if (!isSymbol(key) || !builtInSymbols.has(key)) {
      track(target, "has", key);
    }
    return result;
  }
  ownKeys(target) {
    track(
      target,
      "iterate",
      isArray(target) ? "length" : ITERATE_KEY
    );
    return Reflect.ownKeys(target);
  }
}
class ReadonlyReactiveHandler extends BaseReactiveHandler {
  constructor(isShallow2 = false) {
    super(true, isShallow2);
  }
  set(target, key) {
    return true;
  }
  deleteProperty(target, key) {
    return true;
  }
}
const mutableHandlers = /* @__PURE__ */ new MutableReactiveHandler();
const readonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler();
const shallowReactiveHandlers = /* @__PURE__ */ new MutableReactiveHandler(true);
const shallowReadonlyHandlers = /* @__PURE__ */ new ReadonlyReactiveHandler(true);
const toShallow = (value) => value;
const getProto = (v) => Reflect.getPrototypeOf(v);
function createIterableMethod(method, isReadonly2, isShallow2) {
  return function(...args) {
    const target = this["__v_raw"];
    const rawTarget = /* @__PURE__ */ toRaw(target);
    const targetIsMap = isMap(rawTarget);
    const isPair = method === "entries" || method === Symbol.iterator && targetIsMap;
    const isKeyOnly = method === "keys" && targetIsMap;
    const innerIterator = target[method](...args);
    const wrap = isShallow2 ? toShallow : isReadonly2 ? toReadonly : toReactive;
    !isReadonly2 && track(
      rawTarget,
      "iterate",
      isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY
    );
    return extend(
      // inheriting all iterator properties
      Object.create(innerIterator),
      {
        // iterator protocol
        next() {
          const { value, done } = innerIterator.next();
          return done ? { value, done } : {
            value: isPair ? [wrap(value[0]), wrap(value[1])] : wrap(value),
            done
          };
        }
      }
    );
  };
}
function createReadonlyMethod(type) {
  return function(...args) {
    return type === "delete" ? false : type === "clear" ? void 0 : this;
  };
}
function createInstrumentations(readonly2, shallow) {
  const instrumentations = {
    get(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "get", key);
        }
        track(rawTarget, "get", rawKey);
      }
      const { has } = getProto(rawTarget);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      if (has.call(rawTarget, key)) {
        return wrap(target.get(key));
      } else if (has.call(rawTarget, rawKey)) {
        return wrap(target.get(rawKey));
      } else if (target !== rawTarget) {
        target.get(key);
      }
    },
    get size() {
      const target = this["__v_raw"];
      !readonly2 && track(/* @__PURE__ */ toRaw(target), "iterate", ITERATE_KEY);
      return target.size;
    },
    has(key) {
      const target = this["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const rawKey = /* @__PURE__ */ toRaw(key);
      if (!readonly2) {
        if (hasChanged(key, rawKey)) {
          track(rawTarget, "has", key);
        }
        track(rawTarget, "has", rawKey);
      }
      return key === rawKey ? target.has(key) : target.has(key) || target.has(rawKey);
    },
    forEach(callback, thisArg) {
      const observed = this;
      const target = observed["__v_raw"];
      const rawTarget = /* @__PURE__ */ toRaw(target);
      const wrap = shallow ? toShallow : readonly2 ? toReadonly : toReactive;
      !readonly2 && track(rawTarget, "iterate", ITERATE_KEY);
      return target.forEach((value, key) => {
        return callback.call(thisArg, wrap(value), wrap(key), observed);
      });
    }
  };
  extend(
    instrumentations,
    readonly2 ? {
      add: createReadonlyMethod("add"),
      set: createReadonlyMethod("set"),
      delete: createReadonlyMethod("delete"),
      clear: createReadonlyMethod("clear")
    } : {
      add(value) {
        const target = /* @__PURE__ */ toRaw(this);
        const proto = getProto(target);
        const rawValue = /* @__PURE__ */ toRaw(value);
        const valueToAdd = !shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value) ? rawValue : value;
        const hadKey = proto.has.call(target, valueToAdd) || hasChanged(value, valueToAdd) && proto.has.call(target, value) || hasChanged(rawValue, valueToAdd) && proto.has.call(target, rawValue);
        if (!hadKey) {
          target.add(valueToAdd);
          trigger(target, "add", valueToAdd, valueToAdd);
        }
        return this;
      },
      set(key, value) {
        if (!shallow && !/* @__PURE__ */ isShallow(value) && !/* @__PURE__ */ isReadonly(value)) {
          value = /* @__PURE__ */ toRaw(value);
        }
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get: get2 } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        const oldValue = get2.call(target, key);
        target.set(key, value);
        if (!hadKey) {
          trigger(target, "add", key, value);
        } else if (hasChanged(value, oldValue)) {
          trigger(target, "set", key, value);
        }
        return this;
      },
      delete(key) {
        const target = /* @__PURE__ */ toRaw(this);
        const { has, get: get2 } = getProto(target);
        let hadKey = has.call(target, key);
        if (!hadKey) {
          key = /* @__PURE__ */ toRaw(key);
          hadKey = has.call(target, key);
        }
        get2 ? get2.call(target, key) : void 0;
        const result = target.delete(key);
        if (hadKey) {
          trigger(target, "delete", key, void 0);
        }
        return result;
      },
      clear() {
        const target = /* @__PURE__ */ toRaw(this);
        const hadItems = target.size !== 0;
        const result = target.clear();
        if (hadItems) {
          trigger(
            target,
            "clear",
            void 0,
            void 0
          );
        }
        return result;
      }
    }
  );
  const iteratorMethods = [
    "keys",
    "values",
    "entries",
    Symbol.iterator
  ];
  iteratorMethods.forEach((method) => {
    instrumentations[method] = createIterableMethod(method, readonly2, shallow);
  });
  return instrumentations;
}
function createInstrumentationGetter(isReadonly2, shallow) {
  const instrumentations = createInstrumentations(isReadonly2, shallow);
  return (target, key, receiver) => {
    if (key === "__v_isReactive") {
      return !isReadonly2;
    } else if (key === "__v_isReadonly") {
      return isReadonly2;
    } else if (key === "__v_raw") {
      return target;
    }
    return Reflect.get(
      hasOwn(instrumentations, key) && key in target ? instrumentations : target,
      key,
      receiver
    );
  };
}
const mutableCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, false)
};
const shallowCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(false, true)
};
const readonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, false)
};
const shallowReadonlyCollectionHandlers = {
  get: /* @__PURE__ */ createInstrumentationGetter(true, true)
};
const reactiveMap = /* @__PURE__ */ new WeakMap();
const shallowReactiveMap = /* @__PURE__ */ new WeakMap();
const readonlyMap = /* @__PURE__ */ new WeakMap();
const shallowReadonlyMap = /* @__PURE__ */ new WeakMap();
function targetTypeMap(rawType) {
  switch (rawType) {
    case "Object":
    case "Array":
      return 1;
    case "Map":
    case "Set":
    case "WeakMap":
    case "WeakSet":
      return 2;
    default:
      return 0;
  }
}
// @__NO_SIDE_EFFECTS__
function reactive(target) {
  if (/* @__PURE__ */ isReadonly(target)) {
    return target;
  }
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReactive(target) {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap
  );
}
// @__NO_SIDE_EFFECTS__
function readonly(target) {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap
  );
}
// @__NO_SIDE_EFFECTS__
function shallowReadonly(target) {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap
  );
}
function createReactiveObject(target, isReadonly2, baseHandlers, collectionHandlers, proxyMap) {
  if (!isObject$2(target)) {
    return target;
  }
  if (target["__v_raw"] && !(isReadonly2 && target["__v_isReactive"])) {
    return target;
  }
  if (target["__v_skip"] || !Object.isExtensible(target)) {
    return target;
  }
  const existingProxy = proxyMap.get(target);
  if (existingProxy) {
    return existingProxy;
  }
  const targetType = targetTypeMap(toRawType(target));
  if (targetType === 0) {
    return target;
  }
  const proxy = new Proxy(
    target,
    targetType === 2 ? collectionHandlers : baseHandlers
  );
  proxyMap.set(target, proxy);
  return proxy;
}
// @__NO_SIDE_EFFECTS__
function isReactive(value) {
  if (/* @__PURE__ */ isReadonly(value)) {
    return /* @__PURE__ */ isReactive(value["__v_raw"]);
  }
  return !!(value && value["__v_isReactive"]);
}
// @__NO_SIDE_EFFECTS__
function isReadonly(value) {
  return !!(value && value["__v_isReadonly"]);
}
// @__NO_SIDE_EFFECTS__
function isShallow(value) {
  return !!(value && value["__v_isShallow"]);
}
// @__NO_SIDE_EFFECTS__
function isProxy(value) {
  return value ? !!value["__v_raw"] : false;
}
// @__NO_SIDE_EFFECTS__
function toRaw(observed) {
  const raw = observed && observed["__v_raw"];
  return raw ? /* @__PURE__ */ toRaw(raw) : observed;
}
function markRaw(value) {
  if (!hasOwn(value, "__v_skip") && Object.isExtensible(value)) {
    def(value, "__v_skip", true);
  }
  return value;
}
const toReactive = (value) => isObject$2(value) ? /* @__PURE__ */ reactive(value) : value;
const toReadonly = (value) => isObject$2(value) ? /* @__PURE__ */ readonly(value) : value;
// @__NO_SIDE_EFFECTS__
function isRef(r) {
  return r ? r["__v_isRef"] === true : false;
}
// @__NO_SIDE_EFFECTS__
function ref(value) {
  return createRef(value, false);
}
// @__NO_SIDE_EFFECTS__
function shallowRef(value) {
  return createRef(value, true);
}
function createRef(rawValue, shallow) {
  if (/* @__PURE__ */ isRef(rawValue)) {
    return rawValue;
  }
  return new RefImpl(rawValue, shallow);
}
class RefImpl {
  constructor(value, isShallow2) {
    this.dep = new Dep();
    this["__v_isRef"] = true;
    this["__v_isShallow"] = false;
    this._rawValue = isShallow2 ? value : /* @__PURE__ */ toRaw(value);
    this._value = isShallow2 ? value : toReactive(value);
    this["__v_isShallow"] = isShallow2;
  }
  get value() {
    {
      this.dep.track();
    }
    return this._value;
  }
  set value(newValue) {
    const oldValue = this._rawValue;
    const useDirectValue = this["__v_isShallow"] || /* @__PURE__ */ isShallow(newValue) || /* @__PURE__ */ isReadonly(newValue);
    newValue = useDirectValue ? newValue : /* @__PURE__ */ toRaw(newValue);
    if (hasChanged(newValue, oldValue)) {
      this._rawValue = newValue;
      this._value = useDirectValue ? newValue : toReactive(newValue);
      {
        this.dep.trigger();
      }
    }
  }
}
function triggerRef(ref2) {
  if (ref2.dep) {
    {
      ref2.dep.trigger();
    }
  }
}
function unref(ref2) {
  return /* @__PURE__ */ isRef(ref2) ? ref2.value : ref2;
}
function toValue(source) {
  return isFunction(source) ? source() : unref(source);
}
const shallowUnwrapHandlers = {
  get: (target, key, receiver) => key === "__v_raw" ? target : unref(Reflect.get(target, key, receiver)),
  set: (target, key, value, receiver) => {
    const oldValue = target[key];
    if (/* @__PURE__ */ isRef(oldValue) && !/* @__PURE__ */ isRef(value)) {
      oldValue.value = value;
      return true;
    } else {
      return Reflect.set(target, key, value, receiver);
    }
  }
};
function proxyRefs(objectWithRefs) {
  return /* @__PURE__ */ isReactive(objectWithRefs) ? objectWithRefs : new Proxy(objectWithRefs, shallowUnwrapHandlers);
}
class CustomRefImpl {
  constructor(factory) {
    this["__v_isRef"] = true;
    this._value = void 0;
    const dep = this.dep = new Dep();
    const { get: get2, set: set2 } = factory(dep.track.bind(dep), dep.trigger.bind(dep));
    this._get = get2;
    this._set = set2;
  }
  get value() {
    return this._value = this._get();
  }
  set value(newVal) {
    this._set(newVal);
  }
}
function customRef(factory) {
  return new CustomRefImpl(factory);
}
// @__NO_SIDE_EFFECTS__
function toRefs(object) {
  const ret = isArray(object) ? new Array(object.length) : {};
  for (const key in object) {
    ret[key] = propertyToRef(object, key);
  }
  return ret;
}
class ObjectRefImpl {
  constructor(_object, key, _defaultValue) {
    this._object = _object;
    this._defaultValue = _defaultValue;
    this["__v_isRef"] = true;
    this._value = void 0;
    this._key = isSymbol(key) ? key : String(key);
    this._raw = /* @__PURE__ */ toRaw(_object);
    let shallow = true;
    let obj = _object;
    if (!isArray(_object) || isSymbol(this._key) || !isIntegerKey(this._key)) {
      do {
        shallow = !/* @__PURE__ */ isProxy(obj) || /* @__PURE__ */ isShallow(obj);
      } while (shallow && (obj = obj["__v_raw"]));
    }
    this._shallow = shallow;
  }
  get value() {
    let val = this._object[this._key];
    if (this._shallow) {
      val = unref(val);
    }
    return this._value = val === void 0 ? this._defaultValue : val;
  }
  set value(newVal) {
    if (this._shallow && /* @__PURE__ */ isRef(this._raw[this._key])) {
      const nestedRef = this._object[this._key];
      if (/* @__PURE__ */ isRef(nestedRef)) {
        nestedRef.value = newVal;
        return;
      }
    }
    this._object[this._key] = newVal;
  }
  get dep() {
    return getDepFromReactive(this._raw, this._key);
  }
}
class GetterRefImpl {
  constructor(_getter) {
    this._getter = _getter;
    this["__v_isRef"] = true;
    this["__v_isReadonly"] = true;
    this._value = void 0;
  }
  get value() {
    return this._value = this._getter();
  }
}
// @__NO_SIDE_EFFECTS__
function toRef(source, key, defaultValue) {
  if (/* @__PURE__ */ isRef(source)) {
    return source;
  } else if (isFunction(source)) {
    return new GetterRefImpl(source);
  } else if (isObject$2(source) && arguments.length > 1) {
    return propertyToRef(source, key, defaultValue);
  } else {
    return /* @__PURE__ */ ref(source);
  }
}
function propertyToRef(source, key, defaultValue) {
  return new ObjectRefImpl(source, key, defaultValue);
}
class ComputedRefImpl {
  constructor(fn, setter, isSSR) {
    this.fn = fn;
    this.setter = setter;
    this._value = void 0;
    this.dep = new Dep(this);
    this.__v_isRef = true;
    this.deps = void 0;
    this.depsTail = void 0;
    this.flags = 16;
    this.globalVersion = globalVersion - 1;
    this.next = void 0;
    this.effect = this;
    this["__v_isReadonly"] = !setter;
    this.isSSR = isSSR;
  }
  /**
   * @internal
   */
  notify() {
    this.flags |= 16;
    if (!(this.flags & 8) && // avoid infinite self recursion
    activeSub !== this) {
      batch(this, true);
      return true;
    }
  }
  get value() {
    const link = this.dep.track();
    refreshComputed(this);
    if (link) {
      link.version = this.dep.version;
    }
    return this._value;
  }
  set value(newValue) {
    if (this.setter) {
      this.setter(newValue);
    }
  }
}
// @__NO_SIDE_EFFECTS__
function computed$1(getterOrOptions, debugOptions, isSSR = false) {
  let getter;
  let setter;
  if (isFunction(getterOrOptions)) {
    getter = getterOrOptions;
  } else {
    getter = getterOrOptions.get;
    setter = getterOrOptions.set;
  }
  const cRef = new ComputedRefImpl(getter, setter, isSSR);
  return cRef;
}
const TrackOpTypes = {
  "GET": "get",
  "HAS": "has",
  "ITERATE": "iterate"
};
const TriggerOpTypes = {
  "SET": "set",
  "ADD": "add",
  "DELETE": "delete",
  "CLEAR": "clear"
};
const INITIAL_WATCHER_VALUE = {};
const cleanupMap = /* @__PURE__ */ new WeakMap();
let activeWatcher = void 0;
function getCurrentWatcher() {
  return activeWatcher;
}
function onWatcherCleanup(cleanupFn, failSilently = false, owner = activeWatcher) {
  if (owner) {
    let cleanups = cleanupMap.get(owner);
    if (!cleanups) cleanupMap.set(owner, cleanups = []);
    cleanups.push(cleanupFn);
  }
}
function watch$1(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, once, scheduler, augmentJob, call } = options;
  const reactiveGetter = (source2) => {
    if (deep) return source2;
    if (/* @__PURE__ */ isShallow(source2) || deep === false || deep === 0)
      return traverse(source2, 1);
    return traverse(source2);
  };
  let effect2;
  let getter;
  let cleanup;
  let boundCleanup;
  let forceTrigger = false;
  let isMultiSource = false;
  if (/* @__PURE__ */ isRef(source)) {
    getter = () => source.value;
    forceTrigger = /* @__PURE__ */ isShallow(source);
  } else if (/* @__PURE__ */ isReactive(source)) {
    getter = () => reactiveGetter(source);
    forceTrigger = true;
  } else if (isArray(source)) {
    isMultiSource = true;
    forceTrigger = source.some((s) => /* @__PURE__ */ isReactive(s) || /* @__PURE__ */ isShallow(s));
    getter = () => source.map((s) => {
      if (/* @__PURE__ */ isRef(s)) {
        return s.value;
      } else if (/* @__PURE__ */ isReactive(s)) {
        return reactiveGetter(s);
      } else if (isFunction(s)) {
        return call ? call(s, 2) : s();
      } else ;
    });
  } else if (isFunction(source)) {
    if (cb) {
      getter = call ? () => call(source, 2) : source;
    } else {
      getter = () => {
        if (cleanup) {
          pauseTracking();
          try {
            cleanup();
          } finally {
            resetTracking();
          }
        }
        const currentEffect = activeWatcher;
        activeWatcher = effect2;
        try {
          return call ? call(source, 3, [boundCleanup]) : source(boundCleanup);
        } finally {
          activeWatcher = currentEffect;
        }
      };
    }
  } else {
    getter = NOOP;
  }
  if (cb && deep) {
    const baseGetter = getter;
    const depth = deep === true ? Infinity : deep;
    getter = () => traverse(baseGetter(), depth);
  }
  const scope = getCurrentScope();
  const watchHandle = () => {
    effect2.stop();
    if (scope && scope.active) {
      remove(scope.effects, effect2);
    }
  };
  if (once && cb) {
    const _cb = cb;
    cb = (...args) => {
      const res = _cb(...args);
      watchHandle();
      return res;
    };
  }
  let oldValue = isMultiSource ? new Array(source.length).fill(INITIAL_WATCHER_VALUE) : INITIAL_WATCHER_VALUE;
  const job = (immediateFirstRun) => {
    if (!(effect2.flags & 1) || !effect2.dirty && !immediateFirstRun) {
      return;
    }
    if (cb) {
      const newValue = effect2.run();
      if (immediateFirstRun || deep || forceTrigger || (isMultiSource ? newValue.some((v, i) => hasChanged(v, oldValue[i])) : hasChanged(newValue, oldValue))) {
        if (cleanup) {
          cleanup();
        }
        const currentWatcher = activeWatcher;
        activeWatcher = effect2;
        try {
          const args = [
            newValue,
            // pass undefined as the old value when it's changed for the first time
            oldValue === INITIAL_WATCHER_VALUE ? void 0 : isMultiSource && oldValue[0] === INITIAL_WATCHER_VALUE ? [] : oldValue,
            boundCleanup
          ];
          oldValue = newValue;
          call ? call(cb, 3, args) : (
            // @ts-expect-error
            cb(...args)
          );
        } finally {
          activeWatcher = currentWatcher;
        }
      }
    } else {
      effect2.run();
    }
  };
  if (augmentJob) {
    augmentJob(job);
  }
  effect2 = new ReactiveEffect(getter);
  effect2.scheduler = scheduler ? () => scheduler(job, false) : job;
  boundCleanup = (fn) => onWatcherCleanup(fn, false, effect2);
  cleanup = effect2.onStop = () => {
    const cleanups = cleanupMap.get(effect2);
    if (cleanups) {
      if (call) {
        call(cleanups, 4);
      } else {
        for (const cleanup2 of cleanups) cleanup2();
      }
      cleanupMap.delete(effect2);
    }
  };
  if (cb) {
    if (immediate) {
      job(true);
    } else {
      oldValue = effect2.run();
    }
  } else if (scheduler) {
    scheduler(job.bind(null, true), true);
  } else {
    effect2.run();
  }
  watchHandle.pause = effect2.pause.bind(effect2);
  watchHandle.resume = effect2.resume.bind(effect2);
  watchHandle.stop = watchHandle;
  return watchHandle;
}
function traverse(value, depth = Infinity, seen) {
  if (depth <= 0 || !isObject$2(value) || value["__v_skip"]) {
    return value;
  }
  seen = seen || /* @__PURE__ */ new Map();
  if ((seen.get(value) || 0) >= depth) {
    return value;
  }
  seen.set(value, depth);
  depth--;
  if (/* @__PURE__ */ isRef(value)) {
    traverse(value.value, depth, seen);
  } else if (isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      traverse(value[i], depth, seen);
    }
  } else if (isSet(value) || isMap(value)) {
    value.forEach((v) => {
      traverse(v, depth, seen);
    });
  } else if (isPlainObject$1(value)) {
    for (const key in value) {
      traverse(value[key], depth, seen);
    }
    for (const key of Object.getOwnPropertySymbols(value)) {
      if (Object.prototype.propertyIsEnumerable.call(value, key)) {
        traverse(value[key], depth, seen);
      }
    }
  }
  return value;
}
/**
* @vue/runtime-core v3.5.40
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const stack = [];
function pushWarningContext(vnode) {
  stack.push(vnode);
}
function popWarningContext() {
  stack.pop();
}
let isWarning = false;
function warn$1(msg, ...args) {
  if (isWarning) return;
  isWarning = true;
  pauseTracking();
  const instance = stack.length ? stack[stack.length - 1].component : null;
  const appWarnHandler = instance && instance.appContext.config.warnHandler;
  const trace = getComponentTrace();
  if (appWarnHandler) {
    callWithErrorHandling(
      appWarnHandler,
      instance,
      11,
      [
        // eslint-disable-next-line no-restricted-syntax
        msg + args.map((a) => {
          var _a, _b;
          return (_b = (_a = a.toString) == null ? void 0 : _a.call(a)) != null ? _b : JSON.stringify(a);
        }).join(""),
        instance && instance.proxy,
        trace.map(
          ({ vnode }) => `at <${formatComponentName(instance, vnode.type)}>`
        ).join("\n"),
        trace
      ]
    );
  } else {
    const warnArgs = [`[Vue warn]: ${msg}`, ...args];
    if (trace.length && // avoid spamming console during tests
    true) {
      warnArgs.push(`
`, ...formatTrace(trace));
    }
    console.warn(...warnArgs);
  }
  resetTracking();
  isWarning = false;
}
function getComponentTrace() {
  let currentVNode = stack[stack.length - 1];
  if (!currentVNode) {
    return [];
  }
  const normalizedStack = [];
  while (currentVNode) {
    const last = normalizedStack[0];
    if (last && last.vnode === currentVNode) {
      last.recurseCount++;
    } else {
      normalizedStack.push({
        vnode: currentVNode,
        recurseCount: 0
      });
    }
    const parentInstance = currentVNode.component && currentVNode.component.parent;
    currentVNode = parentInstance && parentInstance.vnode;
  }
  return normalizedStack;
}
function formatTrace(trace) {
  const logs = [];
  trace.forEach((entry, i) => {
    logs.push(...i === 0 ? [] : [`
`], ...formatTraceEntry(entry));
  });
  return logs;
}
function formatTraceEntry({ vnode, recurseCount }) {
  const postfix = recurseCount > 0 ? `... (${recurseCount} recursive calls)` : ``;
  const isRoot = vnode.component ? vnode.component.parent == null : false;
  const open = ` at <${formatComponentName(
    vnode.component,
    vnode.type,
    isRoot
  )}`;
  const close = `>` + postfix;
  return vnode.props ? [open, ...formatProps(vnode.props), close] : [open + close];
}
function formatProps(props) {
  const res = [];
  const keys = Object.keys(props);
  keys.slice(0, 3).forEach((key) => {
    res.push(...formatProp(key, props[key]));
  });
  if (keys.length > 3) {
    res.push(` ...`);
  }
  return res;
}
function formatProp(key, value, raw) {
  if (isString(value)) {
    value = JSON.stringify(value);
    return raw ? value : [`${key}=${value}`];
  } else if (typeof value === "number" || typeof value === "boolean" || value == null) {
    return raw ? value : [`${key}=${value}`];
  } else if (/* @__PURE__ */ isRef(value)) {
    value = formatProp(key, /* @__PURE__ */ toRaw(value.value), true);
    return raw ? value : [`${key}=Ref<`, value, `>`];
  } else if (isFunction(value)) {
    return [`${key}=fn${value.name ? `<${value.name}>` : ``}`];
  } else {
    value = /* @__PURE__ */ toRaw(value);
    return raw ? value : [`${key}=`, value];
  }
}
function assertNumber(val, type) {
  return;
}
const ErrorCodes = {
  "SETUP_FUNCTION": 0,
  "0": "SETUP_FUNCTION",
  "RENDER_FUNCTION": 1,
  "1": "RENDER_FUNCTION",
  "NATIVE_EVENT_HANDLER": 5,
  "5": "NATIVE_EVENT_HANDLER",
  "COMPONENT_EVENT_HANDLER": 6,
  "6": "COMPONENT_EVENT_HANDLER",
  "VNODE_HOOK": 7,
  "7": "VNODE_HOOK",
  "DIRECTIVE_HOOK": 8,
  "8": "DIRECTIVE_HOOK",
  "TRANSITION_HOOK": 9,
  "9": "TRANSITION_HOOK",
  "APP_ERROR_HANDLER": 10,
  "10": "APP_ERROR_HANDLER",
  "APP_WARN_HANDLER": 11,
  "11": "APP_WARN_HANDLER",
  "FUNCTION_REF": 12,
  "12": "FUNCTION_REF",
  "ASYNC_COMPONENT_LOADER": 13,
  "13": "ASYNC_COMPONENT_LOADER",
  "SCHEDULER": 14,
  "14": "SCHEDULER",
  "COMPONENT_UPDATE": 15,
  "15": "COMPONENT_UPDATE",
  "APP_UNMOUNT_CLEANUP": 16,
  "16": "APP_UNMOUNT_CLEANUP"
};
const ErrorTypeStrings$1 = {
  ["sp"]: "serverPrefetch hook",
  ["bc"]: "beforeCreate hook",
  ["c"]: "created hook",
  ["bm"]: "beforeMount hook",
  ["m"]: "mounted hook",
  ["bu"]: "beforeUpdate hook",
  ["u"]: "updated",
  ["bum"]: "beforeUnmount hook",
  ["um"]: "unmounted hook",
  ["a"]: "activated hook",
  ["da"]: "deactivated hook",
  ["ec"]: "errorCaptured hook",
  ["rtc"]: "renderTracked hook",
  ["rtg"]: "renderTriggered hook",
  [0]: "setup function",
  [1]: "render function",
  [2]: "watcher getter",
  [3]: "watcher callback",
  [4]: "watcher cleanup function",
  [5]: "native event handler",
  [6]: "component event handler",
  [7]: "vnode hook",
  [8]: "directive hook",
  [9]: "transition hook",
  [10]: "app errorHandler",
  [11]: "app warnHandler",
  [12]: "ref function",
  [13]: "async component loader",
  [14]: "scheduler flush",
  [15]: "component update",
  [16]: "app unmount cleanup function"
};
function callWithErrorHandling(fn, instance, type, args) {
  try {
    return args ? fn(...args) : fn();
  } catch (err) {
    handleError(err, instance, type);
  }
}
function callWithAsyncErrorHandling(fn, instance, type, args) {
  if (isFunction(fn)) {
    const res = callWithErrorHandling(fn, instance, type, args);
    if (res && isPromise(res)) {
      res.catch((err) => {
        handleError(err, instance, type);
      });
    }
    return res;
  }
  if (isArray(fn)) {
    const values = [];
    for (let i = 0; i < fn.length; i++) {
      values.push(callWithAsyncErrorHandling(fn[i], instance, type, args));
    }
    return values;
  }
}
function handleError(err, instance, type, throwInDev = true) {
  const contextVNode = instance ? instance.vnode : null;
  const { errorHandler, throwUnhandledErrorInProduction } = instance && instance.appContext.config || EMPTY_OBJ;
  if (instance) {
    let cur = instance.parent;
    const exposedInstance = instance.proxy;
    const errorInfo = `https://vuejs.org/error-reference/#runtime-${type}`;
    while (cur) {
      const errorCapturedHooks = cur.ec;
      if (errorCapturedHooks) {
        for (let i = 0; i < errorCapturedHooks.length; i++) {
          if (errorCapturedHooks[i](err, exposedInstance, errorInfo) === false) {
            return;
          }
        }
      }
      cur = cur.parent;
    }
    if (errorHandler) {
      pauseTracking();
      callWithErrorHandling(errorHandler, null, 10, [
        err,
        exposedInstance,
        errorInfo
      ]);
      resetTracking();
      return;
    }
  }
  logError(err, type, contextVNode, throwInDev, throwUnhandledErrorInProduction);
}
function logError(err, type, contextVNode, throwInDev = true, throwInProd = false) {
  if (throwInProd) {
    throw err;
  } else {
    console.error(err);
  }
}
const queue = [];
let flushIndex = -1;
const pendingPostFlushCbs = [];
let activePostFlushCbs = null;
let postFlushIndex = 0;
const resolvedPromise = /* @__PURE__ */ Promise.resolve();
let currentFlushPromise = null;
function nextTick(fn) {
  const p2 = currentFlushPromise || resolvedPromise;
  return fn ? p2.then(this ? fn.bind(this) : fn) : p2;
}
function findInsertionIndex(id) {
  let start = flushIndex + 1;
  let end = queue.length;
  while (start < end) {
    const middle = start + end >>> 1;
    const middleJob = queue[middle];
    const middleJobId = getId(middleJob);
    if (middleJobId < id || middleJobId === id && middleJob.flags & 2) {
      start = middle + 1;
    } else {
      end = middle;
    }
  }
  return start;
}
function queueJob(job) {
  if (!(job.flags & 1)) {
    const jobId = getId(job);
    const lastJob = queue[queue.length - 1];
    if (!lastJob || // fast path when the job id is larger than the tail
    !(job.flags & 2) && jobId >= getId(lastJob)) {
      queue.push(job);
    } else {
      queue.splice(findInsertionIndex(jobId), 0, job);
    }
    job.flags |= 1;
    queueFlush();
  }
}
function queueFlush() {
  if (!currentFlushPromise) {
    currentFlushPromise = resolvedPromise.then(flushJobs);
  }
}
function queuePostFlushCb(cb) {
  if (!isArray(cb)) {
    if (activePostFlushCbs && cb.id === -1) {
      activePostFlushCbs.splice(postFlushIndex + 1, 0, cb);
    } else if (!(cb.flags & 1)) {
      pendingPostFlushCbs.push(cb);
      cb.flags |= 1;
    }
  } else {
    pendingPostFlushCbs.push(...cb);
  }
  queueFlush();
}
function flushPreFlushCbs(instance, seen, i = flushIndex + 1) {
  for (; i < queue.length; i++) {
    const cb = queue[i];
    if (cb && cb.flags & 2) {
      if (instance && cb.id !== instance.uid) {
        continue;
      }
      queue.splice(i, 1);
      i--;
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      cb();
      if (!(cb.flags & 4)) {
        cb.flags &= -2;
      }
    }
  }
}
function flushPostFlushCbs(seen) {
  if (pendingPostFlushCbs.length) {
    const deduped = [...new Set(pendingPostFlushCbs)].sort(
      (a, b) => getId(a) - getId(b)
    );
    pendingPostFlushCbs.length = 0;
    if (activePostFlushCbs) {
      activePostFlushCbs.push(...deduped);
      return;
    }
    activePostFlushCbs = deduped;
    for (postFlushIndex = 0; postFlushIndex < activePostFlushCbs.length; postFlushIndex++) {
      const cb = activePostFlushCbs[postFlushIndex];
      if (cb.flags & 4) {
        cb.flags &= -2;
      }
      if (!(cb.flags & 8)) cb();
      cb.flags &= -2;
    }
    activePostFlushCbs = null;
    postFlushIndex = 0;
  }
}
const getId = (job) => job.id == null ? job.flags & 2 ? -1 : Infinity : job.id;
function flushJobs(seen) {
  try {
    for (flushIndex = 0; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job && !(job.flags & 8)) {
        if (false) ;
        if (job.flags & 4) {
          job.flags &= ~1;
        }
        callWithErrorHandling(
          job,
          job.i,
          job.i ? 15 : 14
        );
        if (!(job.flags & 4)) {
          job.flags &= ~1;
        }
      }
    }
  } finally {
    for (; flushIndex < queue.length; flushIndex++) {
      const job = queue[flushIndex];
      if (job) {
        job.flags &= -2;
      }
    }
    flushIndex = -1;
    queue.length = 0;
    flushPostFlushCbs();
    currentFlushPromise = null;
    if (queue.length || pendingPostFlushCbs.length) {
      flushJobs();
    }
  }
}
let devtools$1;
let buffer = [];
function setDevtoolsHook$1(hook, target) {
  var _a, _b;
  devtools$1 = hook;
  if (devtools$1) {
    devtools$1.enabled = true;
    buffer.forEach(({ event, args }) => devtools$1.emit(event, ...args));
    buffer = [];
  } else if (
    // handle late devtools injection - only do this if we are in an actual
    // browser environment to avoid the timer handle stalling test runner exit
    // (#4815)
    typeof window !== "undefined" && // some envs mock window but not fully
    window.HTMLElement && // also exclude jsdom
    // eslint-disable-next-line no-restricted-syntax
    !((_b = (_a = window.navigator) == null ? void 0 : _a.userAgent) == null ? void 0 : _b.includes("jsdom"))
  ) {
    const replay = target.__VUE_DEVTOOLS_HOOK_REPLAY__ = target.__VUE_DEVTOOLS_HOOK_REPLAY__ || [];
    replay.push((newHook) => {
      setDevtoolsHook$1(newHook, target);
    });
    setTimeout(() => {
      if (!devtools$1) {
        target.__VUE_DEVTOOLS_HOOK_REPLAY__ = null;
        buffer = [];
      }
    }, 3e3);
  } else {
    buffer = [];
  }
}
let currentRenderingInstance = null;
let currentScopeId = null;
function setCurrentRenderingInstance(instance) {
  const prev = currentRenderingInstance;
  currentRenderingInstance = instance;
  currentScopeId = instance && instance.type.__scopeId || null;
  return prev;
}
function pushScopeId(id) {
  currentScopeId = id;
}
function popScopeId() {
  currentScopeId = null;
}
const withScopeId = (_id) => withCtx;
function withCtx(fn, ctx = currentRenderingInstance, isNonScopedSlot) {
  if (!ctx) return fn;
  if (fn._n) {
    return fn;
  }
  const renderFnWithContext = (...args) => {
    if (renderFnWithContext._d) {
      setBlockTracking(-1);
    }
    const prevInstance = setCurrentRenderingInstance(ctx);
    const prevStackSize = blockStack.length;
    let res;
    try {
      res = fn(...args);
    } finally {
      for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
      setCurrentRenderingInstance(prevInstance);
      if (renderFnWithContext._d) {
        setBlockTracking(1);
      }
    }
    return res;
  };
  renderFnWithContext._n = true;
  renderFnWithContext._c = true;
  renderFnWithContext._d = true;
  return renderFnWithContext;
}
function withDirectives(vnode, directives) {
  if (currentRenderingInstance === null) {
    return vnode;
  }
  const instance = getComponentPublicInstance(currentRenderingInstance);
  const bindings = vnode.dirs || (vnode.dirs = []);
  for (let i = 0; i < directives.length; i++) {
    let [dir, value, arg, modifiers = EMPTY_OBJ] = directives[i];
    if (dir) {
      if (isFunction(dir)) {
        dir = {
          mounted: dir,
          updated: dir
        };
      }
      if (dir.deep) {
        traverse(value);
      }
      bindings.push({
        dir,
        instance,
        value,
        oldValue: void 0,
        arg,
        modifiers
      });
    }
  }
  return vnode;
}
function invokeDirectiveHook(vnode, prevVNode, instance, name) {
  const bindings = vnode.dirs;
  const oldBindings = prevVNode && prevVNode.dirs;
  for (let i = 0; i < bindings.length; i++) {
    const binding = bindings[i];
    if (oldBindings) {
      binding.oldValue = oldBindings[i].value;
    }
    let hook = binding.dir[name];
    if (hook) {
      pauseTracking();
      callWithAsyncErrorHandling(hook, instance, 8, [
        vnode.el,
        binding,
        vnode,
        prevVNode
      ]);
      resetTracking();
    }
  }
}
function provide(key, value) {
  if (currentInstance) {
    let provides = currentInstance.provides;
    const parentProvides = currentInstance.parent && currentInstance.parent.provides;
    if (parentProvides === provides) {
      provides = currentInstance.provides = Object.create(parentProvides);
    }
    provides[key] = value;
  }
}
function inject(key, defaultValue, treatDefaultAsFactory = false) {
  const instance = getCurrentInstance();
  if (instance || currentApp) {
    let provides = currentApp ? currentApp._context.provides : instance ? instance.parent == null || instance.ce ? instance.vnode.appContext && instance.vnode.appContext.provides : instance.parent.provides : void 0;
    if (provides && key in provides) {
      return provides[key];
    } else if (arguments.length > 1) {
      return treatDefaultAsFactory && isFunction(defaultValue) ? defaultValue.call(instance && instance.proxy) : defaultValue;
    } else ;
  }
}
function hasInjectionContext() {
  return !!(getCurrentInstance() || currentApp);
}
const ssrContextKey = /* @__PURE__ */ Symbol.for("v-scx");
const useSSRContext = () => {
  {
    const ctx = inject(ssrContextKey);
    return ctx;
  }
};
function watchEffect(effect2, options) {
  return doWatch(effect2, null, options);
}
function watchPostEffect(effect2, options) {
  return doWatch(
    effect2,
    null,
    { flush: "post" }
  );
}
function watchSyncEffect(effect2, options) {
  return doWatch(
    effect2,
    null,
    { flush: "sync" }
  );
}
function watch(source, cb, options) {
  return doWatch(source, cb, options);
}
function doWatch(source, cb, options = EMPTY_OBJ) {
  const { immediate, deep, flush, once } = options;
  const baseWatchOptions = extend({}, options);
  const runsImmediately = cb && immediate || !cb && flush !== "post";
  let ssrCleanup;
  if (isInSSRComponentSetup) {
    if (flush === "sync") {
      const ctx = useSSRContext();
      ssrCleanup = ctx.__watcherHandles || (ctx.__watcherHandles = []);
    } else if (!runsImmediately) {
      const watchStopHandle = () => {
      };
      watchStopHandle.stop = NOOP;
      watchStopHandle.resume = NOOP;
      watchStopHandle.pause = NOOP;
      return watchStopHandle;
    }
  }
  const instance = currentInstance;
  baseWatchOptions.call = (fn, type, args) => callWithAsyncErrorHandling(fn, instance, type, args);
  let isPre = false;
  if (flush === "post") {
    baseWatchOptions.scheduler = (job) => {
      queuePostRenderEffect(job, instance && instance.suspense);
    };
  } else if (flush !== "sync") {
    isPre = true;
    baseWatchOptions.scheduler = (job, isFirstRun) => {
      if (isFirstRun) {
        job();
      } else {
        queueJob(job);
      }
    };
  }
  baseWatchOptions.augmentJob = (job) => {
    if (cb) {
      job.flags |= 4;
    }
    if (isPre) {
      job.flags |= 2;
      if (instance) {
        job.id = instance.uid;
        job.i = instance;
      }
    }
  };
  const watchHandle = watch$1(source, cb, baseWatchOptions);
  if (isInSSRComponentSetup) {
    if (ssrCleanup) {
      ssrCleanup.push(watchHandle);
    } else if (runsImmediately) {
      watchHandle();
    }
  }
  return watchHandle;
}
function instanceWatch(source, value, options) {
  const publicThis = this.proxy;
  const getter = isString(source) ? source.includes(".") ? createPathGetter(publicThis, source) : () => publicThis[source] : source.bind(publicThis, publicThis);
  let cb;
  if (isFunction(value)) {
    cb = value;
  } else {
    cb = value.handler;
    options = value;
  }
  const reset = setCurrentInstance(this);
  const res = doWatch(getter, cb.bind(publicThis), options);
  reset();
  return res;
}
function createPathGetter(ctx, path) {
  const segments = path.split(".");
  return () => {
    let cur = ctx;
    for (let i = 0; i < segments.length && cur; i++) {
      cur = cur[segments[i]];
    }
    return cur;
  };
}
const pendingMounts = /* @__PURE__ */ new WeakMap();
const TeleportEndKey = /* @__PURE__ */ Symbol("_vte");
const isTeleport = (type) => type.__isTeleport;
const isTeleportDisabled = (props) => props && (props.disabled || props.disabled === "");
const isTeleportDeferred = (props) => props && (props.defer || props.defer === "");
const isTargetSVG = (target) => typeof SVGElement !== "undefined" && target instanceof SVGElement;
const isTargetMathML = (target) => typeof MathMLElement === "function" && target instanceof MathMLElement;
const resolveTarget = (props, select) => {
  const targetSelector = props && props.to;
  if (isString(targetSelector)) {
    if (!select) {
      return null;
    } else {
      const target = select(targetSelector);
      return target;
    }
  } else {
    return targetSelector;
  }
};
const TeleportImpl = {
  name: "Teleport",
  __isTeleport: true,
  process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, internals) {
    const {
      mc: mountChildren,
      pc: patchChildren,
      pbc: patchBlockChildren,
      o: { insert, querySelector, createText, createComment, parentNode }
    } = internals;
    const disabled = isTeleportDisabled(n2.props);
    let { dynamicChildren } = n2;
    const mount = (vnode, container2, anchor2) => {
      if (vnode.shapeFlag & 16) {
        mountChildren(
          vnode.children,
          container2,
          anchor2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    };
    const mountToTarget = (vnode = n2) => {
      const disabled2 = isTeleportDisabled(vnode.props);
      const target = vnode.target = resolveTarget(vnode.props, querySelector);
      const targetAnchor = prepareAnchor(target, vnode, createText, insert);
      if (target) {
        if (namespace !== "svg" && isTargetSVG(target)) {
          namespace = "svg";
        } else if (namespace !== "mathml" && isTargetMathML(target)) {
          namespace = "mathml";
        }
        if (parentComponent && parentComponent.isCE) {
          (parentComponent.ce._teleportTargets || (parentComponent.ce._teleportTargets = /* @__PURE__ */ new Set())).add(target);
        }
        if (!disabled2) {
          mount(vnode, target, targetAnchor);
          updateCssVars(vnode, false);
        }
      }
    };
    const queuePendingMount = (vnode) => {
      const mountJob = () => {
        if (pendingMounts.get(vnode) !== mountJob) return;
        pendingMounts.delete(vnode);
        if (isTeleportDisabled(vnode.props)) {
          const mountContainer = parentNode(vnode.el) || container;
          mount(vnode, mountContainer, vnode.anchor);
          updateCssVars(vnode, true);
        }
        mountToTarget(vnode);
      };
      pendingMounts.set(vnode, mountJob);
      queuePostRenderEffect(mountJob, parentSuspense);
    };
    if (n1 == null) {
      const placeholder = n2.el = createText("");
      const mainAnchor = n2.anchor = createText("");
      insert(placeholder, container, anchor);
      insert(mainAnchor, container, anchor);
      if (isTeleportDeferred(n2.props) || parentSuspense && parentSuspense.pendingBranch) {
        queuePendingMount(n2);
        return;
      }
      if (disabled) {
        mount(n2, container, mainAnchor);
        updateCssVars(n2, true);
      }
      mountToTarget();
    } else {
      n2.el = n1.el;
      const mainAnchor = n2.anchor = n1.anchor;
      const pendingMount = pendingMounts.get(n1);
      if (pendingMount) {
        pendingMount.flags |= 8;
        pendingMounts.delete(n1);
        queuePendingMount(n2);
        return;
      }
      n2.targetStart = n1.targetStart;
      const target = n2.target = n1.target;
      const targetAnchor = n2.targetAnchor = n1.targetAnchor;
      const wasDisabled = isTeleportDisabled(n1.props);
      const currentContainer = wasDisabled ? container : target;
      const currentAnchor = wasDisabled ? mainAnchor : targetAnchor;
      if (namespace === "svg" || isTargetSVG(target)) {
        namespace = "svg";
      } else if (namespace === "mathml" || isTargetMathML(target)) {
        namespace = "mathml";
      }
      if (dynamicChildren) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          currentContainer,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        traverseStaticChildren(n1, n2, true);
      } else if (!optimized) {
        patchChildren(
          n1,
          n2,
          currentContainer,
          currentAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          false
        );
      }
      if (disabled) {
        if (!wasDisabled) {
          moveTeleport(
            n2,
            container,
            mainAnchor,
            internals,
            1
          );
        } else {
          if (n2.props && n1.props && n2.props.to !== n1.props.to) {
            n2.props.to = n1.props.to;
          }
        }
      } else {
        if ((n2.props && n2.props.to) !== (n1.props && n1.props.to)) {
          const nextTarget = resolveTarget(n2.props, querySelector);
          if (nextTarget) {
            n2.target = nextTarget;
            moveTeleport(
              n2,
              nextTarget,
              null,
              internals,
              0
            );
          }
        } else if (wasDisabled) {
          moveTeleport(
            n2,
            target,
            targetAnchor,
            internals,
            1
          );
        }
      }
      updateCssVars(n2, disabled);
    }
  },
  remove(vnode, parentComponent, parentSuspense, { um: unmount, o: { remove: hostRemove } }, doRemove) {
    const {
      shapeFlag,
      children,
      anchor,
      targetStart,
      targetAnchor,
      target,
      props
    } = vnode;
    const disabled = isTeleportDisabled(props);
    const shouldRemove = doRemove || !disabled;
    const pendingMount = pendingMounts.get(vnode);
    if (pendingMount) {
      pendingMount.flags |= 8;
      pendingMounts.delete(vnode);
    }
    if (target) {
      hostRemove(targetStart);
      hostRemove(targetAnchor);
    }
    doRemove && hostRemove(anchor);
    if (!pendingMount && (disabled || target) && shapeFlag & 16) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        unmount(
          child,
          parentComponent,
          parentSuspense,
          shouldRemove,
          !!child.dynamicChildren
        );
      }
    }
  },
  move: moveTeleport,
  hydrate: hydrateTeleport
};
function moveTeleport(vnode, container, parentAnchor, { o: { insert }, m: move }, moveType = 2) {
  if (moveType === 0) {
    insert(vnode.targetAnchor, container, parentAnchor);
  }
  const { el, anchor, shapeFlag, children, props } = vnode;
  const isReorder = moveType === 2;
  if (isReorder) {
    insert(el, container, parentAnchor);
  }
  if (!pendingMounts.has(vnode) && (!isReorder || isTeleportDisabled(props))) {
    if (shapeFlag & 16) {
      for (let i = 0; i < children.length; i++) {
        move(
          children[i],
          container,
          parentAnchor,
          2
        );
      }
    }
  }
  if (isReorder) {
    insert(anchor, container, parentAnchor);
  }
}
function hydrateTeleport(node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized, {
  o: { nextSibling, parentNode, querySelector, insert, createText }
}, hydrateChildren) {
  function hydrateAnchor(target2, targetNode) {
    let targetAnchor = targetNode;
    while (targetAnchor) {
      if (targetAnchor && targetAnchor.nodeType === 8) {
        if (targetAnchor.data === "teleport start anchor") {
          vnode.targetStart = targetAnchor;
        } else if (targetAnchor.data === "teleport anchor") {
          vnode.targetAnchor = targetAnchor;
          target2._lpa = vnode.targetAnchor && nextSibling(vnode.targetAnchor);
          break;
        }
      }
      targetAnchor = nextSibling(targetAnchor);
    }
  }
  function hydrateDisabledTeleport(node2, vnode2) {
    vnode2.anchor = hydrateChildren(
      nextSibling(node2),
      vnode2,
      parentNode(node2),
      parentComponent,
      parentSuspense,
      slotScopeIds,
      optimized
    );
  }
  const target = vnode.target = resolveTarget(
    vnode.props,
    querySelector
  );
  const disabled = isTeleportDisabled(vnode.props);
  if (target) {
    const targetNode = target._lpa || target.firstChild;
    if (vnode.shapeFlag & 16) {
      if (disabled) {
        hydrateDisabledTeleport(node, vnode);
        hydrateAnchor(target, targetNode);
        if (!vnode.targetAnchor) {
          prepareAnchor(
            target,
            vnode,
            createText,
            insert,
            // if target is the same as the main view, insert anchors before current node
            // to avoid hydrating mismatch
            parentNode(node) === target ? node : null
          );
        }
      } else {
        vnode.anchor = nextSibling(node);
        hydrateAnchor(target, targetNode);
        if (!vnode.targetAnchor) {
          prepareAnchor(target, vnode, createText, insert);
        }
        hydrateChildren(
          targetNode && nextSibling(targetNode),
          vnode,
          target,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized
        );
      }
    }
    updateCssVars(vnode, disabled);
  } else if (disabled) {
    if (vnode.shapeFlag & 16) {
      hydrateDisabledTeleport(node, vnode);
      vnode.targetStart = node;
      vnode.targetAnchor = nextSibling(node);
    }
  }
  return vnode.anchor && nextSibling(vnode.anchor);
}
const Teleport = TeleportImpl;
function updateCssVars(vnode, isDisabled) {
  const ctx = vnode.ctx;
  if (ctx && ctx.ut) {
    let node, anchor;
    if (isDisabled) {
      node = vnode.el;
      anchor = vnode.anchor;
    } else {
      node = vnode.targetStart;
      anchor = vnode.targetAnchor;
    }
    while (node && node !== anchor) {
      if (node.nodeType === 1) node.setAttribute("data-v-owner", ctx.uid);
      node = node.nextSibling;
    }
    ctx.ut();
  }
}
function prepareAnchor(target, vnode, createText, insert, anchor = null) {
  const targetStart = vnode.targetStart = createText("");
  const targetAnchor = vnode.targetAnchor = createText("");
  targetStart[TeleportEndKey] = targetAnchor;
  if (target) {
    insert(targetStart, target, anchor);
    insert(targetAnchor, target, anchor);
  }
  return targetAnchor;
}
const leaveCbKey = /* @__PURE__ */ Symbol("_leaveCb");
const enterCbKey$1 = /* @__PURE__ */ Symbol("_enterCb");
function useTransitionState() {
  const state = {
    isMounted: false,
    isLeaving: false,
    isUnmounting: false,
    leavingVNodes: /* @__PURE__ */ new Map()
  };
  onMounted(() => {
    state.isMounted = true;
  });
  onBeforeUnmount(() => {
    state.isUnmounting = true;
  });
  return state;
}
const TransitionHookValidator = [Function, Array];
const BaseTransitionPropsValidators = {
  mode: String,
  appear: Boolean,
  persisted: Boolean,
  // enter
  onBeforeEnter: TransitionHookValidator,
  onEnter: TransitionHookValidator,
  onAfterEnter: TransitionHookValidator,
  onEnterCancelled: TransitionHookValidator,
  // leave
  onBeforeLeave: TransitionHookValidator,
  onLeave: TransitionHookValidator,
  onAfterLeave: TransitionHookValidator,
  onLeaveCancelled: TransitionHookValidator,
  // appear
  onBeforeAppear: TransitionHookValidator,
  onAppear: TransitionHookValidator,
  onAfterAppear: TransitionHookValidator,
  onAppearCancelled: TransitionHookValidator
};
const recursiveGetSubtree = (instance) => {
  const subTree = instance.subTree;
  return subTree.component ? recursiveGetSubtree(subTree.component) : subTree;
};
const BaseTransitionImpl = {
  name: `BaseTransition`,
  props: BaseTransitionPropsValidators,
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    return () => {
      const children = slots.default && getTransitionRawChildren(slots.default(), true);
      const child = children && children.length ? findNonCommentChild(children) : (
        // Keep explicit default-slot conditionals on the same transition path
        // as regular v-if branches, which render a comment placeholder.
        instance.subTree ? createCommentVNode() : void 0
      );
      if (!child) {
        return;
      }
      const rawProps = /* @__PURE__ */ toRaw(props);
      const { mode } = rawProps;
      if (state.isLeaving) {
        return emptyPlaceholder(child);
      }
      const innerChild = getInnerChild$1(child);
      if (!innerChild) {
        return emptyPlaceholder(child);
      }
      let enterHooks = resolveTransitionHooks(
        innerChild,
        rawProps,
        state,
        instance,
        // #11061, ensure enterHooks is fresh after clone
        (hooks) => enterHooks = hooks
      );
      if (innerChild.type !== Comment) {
        setTransitionHooks(innerChild, enterHooks);
      }
      let oldInnerChild = instance.subTree && getInnerChild$1(instance.subTree);
      if (oldInnerChild && oldInnerChild.type !== Comment && !isSameVNodeType(oldInnerChild, innerChild) && recursiveGetSubtree(instance).type !== Comment) {
        let leavingHooks = resolveTransitionHooks(
          oldInnerChild,
          rawProps,
          state,
          instance
        );
        setTransitionHooks(oldInnerChild, leavingHooks);
        if (mode === "out-in" && innerChild.type !== Comment) {
          state.isLeaving = true;
          leavingHooks.afterLeave = () => {
            state.isLeaving = false;
            if (!(instance.job.flags & 8)) {
              instance.update();
            }
            delete leavingHooks.afterLeave;
            oldInnerChild = void 0;
          };
          return emptyPlaceholder(child);
        } else if (mode === "in-out" && innerChild.type !== Comment) {
          leavingHooks.delayLeave = (el, earlyRemove, delayedLeave) => {
            const leavingVNodesCache = getLeavingNodesForType(
              state,
              oldInnerChild
            );
            leavingVNodesCache[String(oldInnerChild.key)] = oldInnerChild;
            el[leaveCbKey] = () => {
              earlyRemove();
              el[leaveCbKey] = void 0;
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
            enterHooks.delayedLeave = () => {
              delayedLeave();
              delete enterHooks.delayedLeave;
              oldInnerChild = void 0;
            };
          };
        } else {
          oldInnerChild = void 0;
        }
      } else if (oldInnerChild) {
        oldInnerChild = void 0;
      }
      return child;
    };
  }
};
function findNonCommentChild(children) {
  let child = children[0];
  if (children.length > 1) {
    for (const c of children) {
      if (c.type !== Comment) {
        child = c;
        break;
      }
    }
  }
  return child;
}
const BaseTransition = BaseTransitionImpl;
function getLeavingNodesForType(state, vnode) {
  const { leavingVNodes } = state;
  let leavingVNodesCache = leavingVNodes.get(vnode.type);
  if (!leavingVNodesCache) {
    leavingVNodesCache = /* @__PURE__ */ Object.create(null);
    leavingVNodes.set(vnode.type, leavingVNodesCache);
  }
  return leavingVNodesCache;
}
function resolveTransitionHooks(vnode, props, state, instance, postClone) {
  const {
    appear,
    mode,
    persisted = false,
    onBeforeEnter,
    onEnter,
    onAfterEnter,
    onEnterCancelled,
    onBeforeLeave,
    onLeave,
    onAfterLeave,
    onLeaveCancelled,
    onBeforeAppear,
    onAppear,
    onAfterAppear,
    onAppearCancelled
  } = props;
  const key = String(vnode.key);
  const leavingVNodesCache = getLeavingNodesForType(state, vnode);
  const callHook2 = (hook, args) => {
    hook && callWithAsyncErrorHandling(
      hook,
      instance,
      9,
      args
    );
  };
  const callAsyncHook = (hook, args) => {
    const done = args[1];
    callHook2(hook, args);
    if (isArray(hook)) {
      if (hook.every((hook2) => hook2.length <= 1)) done();
    } else if (hook.length <= 1) {
      done();
    }
  };
  const hooks = {
    mode,
    persisted,
    beforeEnter(el) {
      let hook = onBeforeEnter;
      if (!state.isMounted) {
        if (appear) {
          hook = onBeforeAppear || onBeforeEnter;
        } else {
          return;
        }
      }
      if (el[leaveCbKey]) {
        el[leaveCbKey](
          true
          /* cancelled */
        );
      }
      const leavingVNode = leavingVNodesCache[key];
      if (leavingVNode && isSameVNodeType(vnode, leavingVNode) && leavingVNode.el[leaveCbKey]) {
        leavingVNode.el[leaveCbKey]();
      }
      callHook2(hook, [el]);
    },
    enter(el) {
      if (leavingVNodesCache[key] === vnode) return;
      let hook = onEnter;
      let afterHook = onAfterEnter;
      let cancelHook = onEnterCancelled;
      if (!state.isMounted) {
        if (appear) {
          hook = onAppear || onEnter;
          afterHook = onAfterAppear || onAfterEnter;
          cancelHook = onAppearCancelled || onEnterCancelled;
        } else {
          return;
        }
      }
      let called = false;
      el[enterCbKey$1] = (cancelled) => {
        if (called) return;
        called = true;
        if (cancelled) {
          callHook2(cancelHook, [el]);
        } else {
          callHook2(afterHook, [el]);
        }
        if (hooks.delayedLeave) {
          hooks.delayedLeave();
        }
        el[enterCbKey$1] = void 0;
      };
      const done = el[enterCbKey$1].bind(null, false);
      if (hook) {
        callAsyncHook(hook, [el, done]);
      } else {
        done();
      }
    },
    leave(el, remove2) {
      const key2 = String(vnode.key);
      if (el[enterCbKey$1]) {
        el[enterCbKey$1](
          true
          /* cancelled */
        );
      }
      if (state.isUnmounting) {
        return remove2();
      }
      callHook2(onBeforeLeave, [el]);
      let called = false;
      el[leaveCbKey] = (cancelled) => {
        if (called) return;
        called = true;
        remove2();
        if (cancelled) {
          callHook2(onLeaveCancelled, [el]);
        } else {
          callHook2(onAfterLeave, [el]);
        }
        el[leaveCbKey] = void 0;
        if (leavingVNodesCache[key2] === vnode) {
          delete leavingVNodesCache[key2];
        }
      };
      const done = el[leaveCbKey].bind(null, false);
      leavingVNodesCache[key2] = vnode;
      if (onLeave) {
        callAsyncHook(onLeave, [el, done]);
      } else {
        done();
      }
    },
    clone(vnode2) {
      const hooks2 = resolveTransitionHooks(
        vnode2,
        props,
        state,
        instance,
        postClone
      );
      if (postClone) postClone(hooks2);
      return hooks2;
    }
  };
  return hooks;
}
function emptyPlaceholder(vnode) {
  if (isKeepAlive(vnode)) {
    vnode = cloneVNode(vnode);
    vnode.children = null;
    return vnode;
  }
}
function getInnerChild$1(vnode) {
  if (!isKeepAlive(vnode)) {
    if (isTeleport(vnode.type) && vnode.children) {
      return findNonCommentChild(vnode.children);
    }
    return vnode;
  }
  if (vnode.component) {
    return vnode.component.subTree;
  }
  const { shapeFlag, children } = vnode;
  if (children) {
    if (shapeFlag & 16) {
      return children[0];
    }
    if (shapeFlag & 32 && isFunction(children.default)) {
      return children.default();
    }
  }
}
function setTransitionHooks(vnode, hooks) {
  if (vnode.shapeFlag & 6 && vnode.component) {
    vnode.transition = hooks;
    setTransitionHooks(vnode.component.subTree, hooks);
  } else if (vnode.shapeFlag & 128) {
    vnode.ssContent.transition = hooks.clone(vnode.ssContent);
    vnode.ssFallback.transition = hooks.clone(vnode.ssFallback);
  } else {
    vnode.transition = hooks;
  }
}
function getTransitionRawChildren(children, keepComment = false, parentKey) {
  let ret = [];
  let keyedFragmentCount = 0;
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    const key = parentKey == null ? child.key : String(parentKey) + String(child.key != null ? child.key : i);
    if (child.type === Fragment) {
      if (child.patchFlag & 128) keyedFragmentCount++;
      ret = ret.concat(
        getTransitionRawChildren(child.children, keepComment, key)
      );
    } else if (keepComment || child.type !== Comment) {
      ret.push(key != null ? cloneVNode(child, { key }) : child);
    }
  }
  if (keyedFragmentCount > 1) {
    for (let i = 0; i < ret.length; i++) {
      ret[i].patchFlag = -2;
    }
  }
  return ret;
}
// @__NO_SIDE_EFFECTS__
function defineComponent(options, extraOptions) {
  return isFunction(options) ? (
    // #8236: extend call and options.name access are considered side-effects
    // by Rollup, so we have to wrap it in a pure-annotated IIFE.
    /* @__PURE__ */ (() => extend({ name: options.name }, extraOptions, { setup: options }))()
  ) : options;
}
function useId() {
  const i = getCurrentInstance();
  if (i) {
    return (i.appContext.config.idPrefix || "v") + "-" + i.ids[0] + i.ids[1]++;
  }
  return "";
}
function markAsyncBoundary(instance) {
  instance.ids = [instance.ids[0] + instance.ids[2]++ + "-", 0, 0];
}
function useTemplateRef(key) {
  const i = getCurrentInstance();
  const r = /* @__PURE__ */ shallowRef(null);
  if (i) {
    const refs = i.refs === EMPTY_OBJ ? i.refs = {} : i.refs;
    {
      Object.defineProperty(refs, key, {
        enumerable: true,
        get: () => r.value,
        set: (val) => r.value = val
      });
    }
  }
  const ret = r;
  return ret;
}
function isTemplateRefKey(refs, key) {
  let desc;
  return !!((desc = Object.getOwnPropertyDescriptor(refs, key)) && !desc.configurable);
}
const pendingSetRefMap = /* @__PURE__ */ new WeakMap();
function setRef(rawRef, oldRawRef, parentSuspense, vnode, isUnmount = false) {
  if (isArray(rawRef)) {
    rawRef.forEach(
      (r, i) => setRef(
        r,
        oldRawRef && (isArray(oldRawRef) ? oldRawRef[i] : oldRawRef),
        parentSuspense,
        vnode,
        isUnmount
      )
    );
    return;
  }
  if (isAsyncWrapper(vnode) && !isUnmount) {
    if (vnode.shapeFlag & 512 && vnode.type.__asyncResolved && vnode.component.subTree.component) {
      setRef(rawRef, oldRawRef, parentSuspense, vnode.component.subTree);
    }
    return;
  }
  const refValue = vnode.shapeFlag & 4 ? getComponentPublicInstance(vnode.component) : vnode.el;
  const value = isUnmount ? null : refValue;
  const { i: owner, r: ref3 } = rawRef;
  const oldRef = oldRawRef && oldRawRef.r;
  const refs = owner.refs === EMPTY_OBJ ? owner.refs = {} : owner.refs;
  const setupState = owner.setupState;
  const rawSetupState = /* @__PURE__ */ toRaw(setupState);
  const canSetSetupRef = setupState === EMPTY_OBJ ? NO : (key) => {
    if (isTemplateRefKey(refs, key)) {
      return false;
    }
    return hasOwn(rawSetupState, key);
  };
  const canSetRef = (ref22, key) => {
    if (key && isTemplateRefKey(refs, key)) {
      return false;
    }
    return true;
  };
  if (oldRef != null && oldRef !== ref3) {
    invalidatePendingSetRef(oldRawRef);
    if (isString(oldRef)) {
      refs[oldRef] = null;
      if (canSetSetupRef(oldRef)) {
        setupState[oldRef] = null;
      }
    } else if (/* @__PURE__ */ isRef(oldRef)) {
      const oldRawRefAtom = oldRawRef;
      if (canSetRef(oldRef, oldRawRefAtom.k)) {
        oldRef.value = null;
      }
      if (oldRawRefAtom.k) refs[oldRawRefAtom.k] = null;
    }
  }
  if (isFunction(ref3)) {
    callWithErrorHandling(ref3, owner, 12, [value, refs]);
  } else {
    const _isString = isString(ref3);
    const _isRef = /* @__PURE__ */ isRef(ref3);
    if (_isString || _isRef) {
      const doSet = () => {
        if (rawRef.f) {
          const existing = _isString ? canSetSetupRef(ref3) ? setupState[ref3] : refs[ref3] : canSetRef() || !rawRef.k ? ref3.value : refs[rawRef.k];
          if (isUnmount) {
            isArray(existing) && remove(existing, refValue);
          } else {
            if (!isArray(existing)) {
              if (_isString) {
                refs[ref3] = [refValue];
                if (canSetSetupRef(ref3)) {
                  setupState[ref3] = refs[ref3];
                }
              } else {
                const newVal = [refValue];
                if (canSetRef(ref3, rawRef.k)) {
                  ref3.value = newVal;
                }
                if (rawRef.k) refs[rawRef.k] = newVal;
              }
            } else if (!existing.includes(refValue)) {
              existing.push(refValue);
            }
          }
        } else if (_isString) {
          refs[ref3] = value;
          if (canSetSetupRef(ref3)) {
            setupState[ref3] = value;
          }
        } else if (_isRef) {
          if (canSetRef(ref3, rawRef.k)) {
            ref3.value = value;
          }
          if (rawRef.k) refs[rawRef.k] = value;
        } else ;
      };
      if (value) {
        const job = () => {
          doSet();
          pendingSetRefMap.delete(rawRef);
        };
        job.id = -1;
        pendingSetRefMap.set(rawRef, job);
        queuePostRenderEffect(job, parentSuspense);
      } else {
        invalidatePendingSetRef(rawRef);
        doSet();
      }
    }
  }
}
function invalidatePendingSetRef(rawRef) {
  const pendingSetRef = pendingSetRefMap.get(rawRef);
  if (pendingSetRef) {
    pendingSetRef.flags |= 8;
    pendingSetRefMap.delete(rawRef);
  }
}
let hasLoggedMismatchError = false;
const logMismatchError = () => {
  if (hasLoggedMismatchError) {
    return;
  }
  console.error("Hydration completed but contains mismatches.");
  hasLoggedMismatchError = true;
};
const isSVGContainer = (container) => container.namespaceURI.includes("svg") && container.tagName !== "foreignObject";
const isMathMLContainer = (container) => container.namespaceURI.includes("MathML");
const getContainerType = (container) => {
  if (container.nodeType !== 1) return void 0;
  if (isSVGContainer(container)) return "svg";
  if (isMathMLContainer(container)) return "mathml";
  return void 0;
};
const isComment = (node) => node.nodeType === 8;
function createHydrationFunctions(rendererInternals) {
  const {
    mt: mountComponent,
    p: patch,
    o: {
      patchProp: patchProp2,
      createText,
      nextSibling,
      parentNode,
      remove: remove2,
      insert,
      createComment
    }
  } = rendererInternals;
  const hydrate2 = (vnode, container) => {
    if (!container.hasChildNodes()) {
      patch(null, vnode, container);
      flushPostFlushCbs();
      container._vnode = vnode;
      return;
    }
    hydrateNode(container.firstChild, vnode, null, null, null);
    flushPostFlushCbs();
    container._vnode = vnode;
  };
  const hydrateNode = (node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized = false) => {
    optimized = optimized || !!vnode.dynamicChildren;
    const isFragmentStart = isComment(node) && node.data === "[";
    const onMismatch = () => handleMismatch(
      node,
      vnode,
      parentComponent,
      parentSuspense,
      slotScopeIds,
      isFragmentStart
    );
    const { type, ref: ref3, shapeFlag, patchFlag } = vnode;
    let domType = node.nodeType;
    vnode.el = node;
    if (patchFlag === -2) {
      optimized = false;
      vnode.dynamicChildren = null;
    }
    let nextNode = null;
    switch (type) {
      case Text:
        if (domType !== 3) {
          if (vnode.children === "") {
            insert(vnode.el = createText(""), parentNode(node), node);
            nextNode = node;
          } else {
            nextNode = onMismatch();
          }
        } else {
          if (node.data !== vnode.children) {
            logMismatchError();
            node.data = vnode.children;
          }
          nextNode = nextSibling(node);
        }
        break;
      case Comment:
        if (isTemplateNode(node)) {
          nextNode = nextSibling(node);
          replaceNode(
            vnode.el = node.content.firstChild,
            node,
            parentComponent
          );
        } else if (domType !== 8 || isFragmentStart) {
          nextNode = onMismatch();
        } else {
          nextNode = nextSibling(node);
        }
        break;
      case Static:
        if (isFragmentStart) {
          node = nextSibling(node);
          domType = node.nodeType;
        }
        if (domType === 1 || domType === 3) {
          nextNode = node;
          const needToAdoptContent = !vnode.children.length;
          for (let i = 0; i < vnode.staticCount; i++) {
            if (needToAdoptContent)
              vnode.children += nextNode.nodeType === 1 ? nextNode.outerHTML : nextNode.data;
            if (i === vnode.staticCount - 1) {
              vnode.anchor = nextNode;
            }
            nextNode = nextSibling(nextNode);
          }
          return isFragmentStart ? nextSibling(nextNode) : nextNode;
        } else {
          onMismatch();
        }
        break;
      case Fragment:
        if (!isFragmentStart) {
          nextNode = onMismatch();
        } else {
          nextNode = hydrateFragment(
            node,
            vnode,
            parentComponent,
            parentSuspense,
            slotScopeIds,
            optimized
          );
        }
        break;
      default:
        if (shapeFlag & 1) {
          if ((domType !== 1 || vnode.type.toLowerCase() !== node.tagName.toLowerCase()) && !isTemplateNode(node)) {
            nextNode = onMismatch();
          } else {
            nextNode = hydrateElement(
              node,
              vnode,
              parentComponent,
              parentSuspense,
              slotScopeIds,
              optimized
            );
          }
        } else if (shapeFlag & 6) {
          vnode.slotScopeIds = slotScopeIds;
          const container = parentNode(node);
          if (isFragmentStart) {
            nextNode = locateClosingAnchor(node);
          } else if (isComment(node) && node.data === "teleport start") {
            nextNode = locateClosingAnchor(node, node.data, "teleport end");
          } else {
            nextNode = nextSibling(node);
          }
          mountComponent(
            vnode,
            container,
            null,
            parentComponent,
            parentSuspense,
            getContainerType(container),
            optimized
          );
          if (isAsyncWrapper(vnode) && !vnode.type.__asyncResolved) {
            let subTree;
            if (isFragmentStart) {
              subTree = createVNode(Fragment);
              subTree.anchor = nextNode ? nextNode.previousSibling : container.lastChild;
            } else {
              subTree = node.nodeType === 3 ? createTextVNode("") : createVNode("div");
            }
            subTree.el = node;
            vnode.component.subTree = subTree;
          }
        } else if (shapeFlag & 64) {
          if (domType !== 8) {
            nextNode = onMismatch();
          } else {
            nextNode = vnode.type.hydrate(
              node,
              vnode,
              parentComponent,
              parentSuspense,
              slotScopeIds,
              optimized,
              rendererInternals,
              hydrateChildren
            );
          }
        } else if (shapeFlag & 128) {
          nextNode = vnode.type.hydrate(
            node,
            vnode,
            parentComponent,
            parentSuspense,
            getContainerType(parentNode(node)),
            slotScopeIds,
            optimized,
            rendererInternals,
            hydrateNode
          );
        } else ;
    }
    if (ref3 != null) {
      setRef(ref3, null, parentSuspense, vnode);
    }
    return nextNode;
  };
  const hydrateElement = (el, vnode, parentComponent, parentSuspense, slotScopeIds, optimized) => {
    optimized = optimized || !!vnode.dynamicChildren;
    const {
      type,
      dynamicProps,
      props,
      patchFlag,
      shapeFlag,
      dirs,
      transition
    } = vnode;
    const forcePatch = type === "input" || type === "option";
    const hasDynamicProps = !!dynamicProps;
    if (forcePatch || hasDynamicProps || patchFlag !== -1) {
      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "created");
      }
      let needCallTransitionHooks = false;
      if (isTemplateNode(el)) {
        needCallTransitionHooks = needTransition(
          null,
          // no need check parentSuspense in hydration
          transition
        ) && parentComponent && parentComponent.vnode.props && parentComponent.vnode.props.appear;
        const content = el.content.firstChild;
        if (needCallTransitionHooks) {
          const cls = content.getAttribute("class");
          if (cls) content.$cls = cls;
          transition.beforeEnter(content);
        }
        replaceNode(content, el, parentComponent);
        vnode.el = el = content;
      }
      if (shapeFlag & 16 && // skip if element has innerHTML / textContent
      !(props && (props.innerHTML || props.textContent))) {
        let next = hydrateChildren(
          el.firstChild,
          vnode,
          el,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized
        );
        if (next && !isMismatchAllowed(
          el,
          1
          /* CHILDREN */
        )) {
          logMismatchError();
        }
        while (next) {
          const cur = next;
          next = next.nextSibling;
          remove2(cur);
        }
      } else if (shapeFlag & 8) {
        let clientText = vnode.children;
        if (clientText[0] === "\n" && (el.tagName === "PRE" || el.tagName === "TEXTAREA")) {
          clientText = clientText.slice(1);
        }
        const { textContent } = el;
        if (textContent !== clientText && // innerHTML normalize \r\n or \r into a single \n in the DOM
        textContent !== clientText.replace(/\r\n|\r/g, "\n")) {
          if (!isMismatchAllowed(
            el,
            0
            /* TEXT */
          )) {
            logMismatchError();
          }
          el.textContent = vnode.children;
        }
      }
      if (props) {
        if (forcePatch || hasDynamicProps || !optimized || patchFlag & (16 | 32)) {
          const isCustomElement = el.tagName.includes("-");
          const namespace = el.namespaceURI.includes("svg") ? "svg" : el.namespaceURI.includes("MathML") ? "mathml" : void 0;
          for (const key in props) {
            if (forcePatch && (key.endsWith("value") || key === "indeterminate") || isOn(key) && !isReservedProp(key) || // force hydrate v-bind with .prop modifiers
            key[0] === "." || isCustomElement && !isReservedProp(key) || dynamicProps && dynamicProps.includes(key)) {
              patchProp2(el, key, null, props[key], namespace, parentComponent);
            }
          }
        } else if (props.onClick) {
          patchProp2(
            el,
            "onClick",
            null,
            props.onClick,
            void 0,
            parentComponent
          );
        } else if (patchFlag & 4 && /* @__PURE__ */ isReactive(props.style)) {
          for (const key in props.style) props.style[key];
        }
      }
      let vnodeHooks;
      if (vnodeHooks = props && props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHooks, parentComponent, vnode);
      }
      if (dirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
      }
      if ((vnodeHooks = props && props.onVnodeMounted) || dirs || needCallTransitionHooks) {
        queueEffectWithSuspense(() => {
          vnodeHooks && invokeVNodeHook(vnodeHooks, parentComponent, vnode);
          needCallTransitionHooks && transition.enter(el);
          dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
        }, parentSuspense);
      }
    }
    return el.nextSibling;
  };
  const hydrateChildren = (node, parentVNode, container, parentComponent, parentSuspense, slotScopeIds, optimized) => {
    optimized = optimized || !!parentVNode.dynamicChildren;
    const children = parentVNode.children;
    const l = children.length;
    let hasCheckedMismatch = false;
    for (let i = 0; i < l; i++) {
      const vnode = optimized ? children[i] : children[i] = normalizeVNode(children[i]);
      const isText = vnode.type === Text;
      if (node) {
        if (isText && !optimized) {
          if (i + 1 < l && normalizeVNode(children[i + 1]).type === Text) {
            insert(
              createText(
                node.data.slice(vnode.children.length)
              ),
              container,
              nextSibling(node)
            );
            node.data = vnode.children;
          }
        }
        node = hydrateNode(
          node,
          vnode,
          parentComponent,
          parentSuspense,
          slotScopeIds,
          optimized
        );
      } else if (isText && !vnode.children) {
        insert(vnode.el = createText(""), container);
      } else {
        if (!hasCheckedMismatch) {
          hasCheckedMismatch = true;
          if (!isMismatchAllowed(
            container,
            1
            /* CHILDREN */
          )) {
            logMismatchError();
          }
        }
        patch(
          null,
          vnode,
          container,
          null,
          parentComponent,
          parentSuspense,
          getContainerType(container),
          slotScopeIds
        );
      }
    }
    return node;
  };
  const hydrateFragment = (node, vnode, parentComponent, parentSuspense, slotScopeIds, optimized) => {
    const { slotScopeIds: fragmentSlotScopeIds } = vnode;
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    const container = parentNode(node);
    const next = hydrateChildren(
      nextSibling(node),
      vnode,
      container,
      parentComponent,
      parentSuspense,
      slotScopeIds,
      optimized
    );
    if (next && isComment(next) && next.data === "]") {
      return nextSibling(vnode.anchor = next);
    } else {
      logMismatchError();
      insert(vnode.anchor = createComment(`]`), container, next);
      return next;
    }
  };
  const handleMismatch = (node, vnode, parentComponent, parentSuspense, slotScopeIds, isFragment) => {
    if (!isNodeMismatchAllowed(node, vnode)) {
      logMismatchError();
    }
    vnode.el = null;
    if (isFragment) {
      const end = locateClosingAnchor(node);
      while (true) {
        const next2 = nextSibling(node);
        if (next2 && next2 !== end) {
          remove2(next2);
        } else {
          break;
        }
      }
    }
    const next = nextSibling(node);
    const container = parentNode(node);
    remove2(node);
    patch(
      null,
      vnode,
      container,
      next,
      parentComponent,
      parentSuspense,
      getContainerType(container),
      slotScopeIds
    );
    if (parentComponent) {
      parentComponent.vnode.el = vnode.el;
      updateHOCHostEl(parentComponent, vnode.el);
    }
    return next;
  };
  const locateClosingAnchor = (node, open = "[", close = "]") => {
    let match = 0;
    while (node) {
      node = nextSibling(node);
      if (node && isComment(node)) {
        if (node.data === open) match++;
        if (node.data === close) {
          if (match === 0) {
            return nextSibling(node);
          } else {
            match--;
          }
        }
      }
    }
    return node;
  };
  const replaceNode = (newNode, oldNode, parentComponent) => {
    const parentNode2 = oldNode.parentNode;
    if (parentNode2) {
      parentNode2.replaceChild(newNode, oldNode);
    }
    let parent = parentComponent;
    while (parent) {
      if (parent.vnode.el === oldNode) {
        parent.vnode.el = parent.subTree.el = newNode;
      }
      parent = parent.parent;
    }
  };
  const isTemplateNode = (node) => {
    return node.nodeType === 1 && node.tagName === "TEMPLATE";
  };
  return [hydrate2, hydrateNode];
}
const allowMismatchAttr = "data-allow-mismatch";
const MismatchTypeString = {
  [
    0
    /* TEXT */
  ]: "text",
  [
    1
    /* CHILDREN */
  ]: "children",
  [
    2
    /* CLASS */
  ]: "class",
  [
    3
    /* STYLE */
  ]: "style",
  [
    4
    /* ATTRIBUTE */
  ]: "attribute"
};
function isMismatchAllowed(el, allowedType) {
  if (allowedType === 0 || allowedType === 1) {
    while (el && !el.hasAttribute(allowMismatchAttr)) {
      el = el.parentElement;
    }
  }
  return isMismatchAllowedByAttr(
    el && el.getAttribute(allowMismatchAttr),
    allowedType
  );
}
function isMismatchAllowedByAttr(allowedAttr, allowedType) {
  if (allowedAttr == null) {
    return false;
  } else if (allowedAttr === "") {
    return true;
  } else {
    const list = allowedAttr.split(",");
    if (allowedType === 0 && list.includes("children")) {
      return true;
    }
    return list.includes(MismatchTypeString[allowedType]);
  }
}
function isNodeMismatchAllowed(node, vnode) {
  return isMismatchAllowed(
    node.parentElement,
    1
    /* CHILDREN */
  ) || isMismatchAllowedByNode(node) || isMismatchAllowedByVNode(vnode);
}
function isMismatchAllowedByNode(node) {
  return node.nodeType === 1 && isMismatchAllowedByAttr(
    node.getAttribute(allowMismatchAttr),
    1
    /* CHILDREN */
  );
}
function isMismatchAllowedByVNode({ props }) {
  const allowedAttr = props && props[allowMismatchAttr];
  return typeof allowedAttr === "string" && isMismatchAllowedByAttr(
    allowedAttr,
    1
    /* CHILDREN */
  );
}
const requestIdleCallback = getGlobalThis().requestIdleCallback || ((cb) => setTimeout(cb, 1));
const cancelIdleCallback = getGlobalThis().cancelIdleCallback || ((id) => clearTimeout(id));
const hydrateOnIdle = (timeout = 1e4) => (hydrate2) => {
  const id = requestIdleCallback(hydrate2, { timeout });
  return () => cancelIdleCallback(id);
};
function elementIsVisibleInViewport(el) {
  const { top, left, bottom, right } = el.getBoundingClientRect();
  const { innerHeight, innerWidth } = window;
  return (top > 0 && top < innerHeight || bottom > 0 && bottom < innerHeight) && (left > 0 && left < innerWidth || right > 0 && right < innerWidth);
}
const hydrateOnVisible = (opts) => (hydrate2, forEach) => {
  const ob = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      ob.disconnect();
      hydrate2();
      break;
    }
  }, opts);
  forEach((el) => {
    if (!(el instanceof Element)) return;
    if (elementIsVisibleInViewport(el)) {
      hydrate2();
      ob.disconnect();
      return false;
    }
    ob.observe(el);
  });
  return () => ob.disconnect();
};
const hydrateOnMediaQuery = (query) => (hydrate2) => {
  if (query) {
    const mql = matchMedia(query);
    if (mql.matches) {
      hydrate2();
    } else {
      mql.addEventListener("change", hydrate2, { once: true });
      return () => mql.removeEventListener("change", hydrate2);
    }
  }
};
const hydrateOnInteraction = (interactions = []) => (hydrate2, forEach) => {
  if (isString(interactions)) interactions = [interactions];
  let hasHydrated = false;
  const doHydrate = (e) => {
    if (!hasHydrated) {
      hasHydrated = true;
      teardown();
      hydrate2();
      e.target.dispatchEvent(new e.constructor(e.type, e));
    }
  };
  const teardown = () => {
    forEach((el) => {
      for (const i of interactions) {
        el.removeEventListener(i, doHydrate);
      }
    });
  };
  forEach((el) => {
    for (const i of interactions) {
      el.addEventListener(i, doHydrate, { once: true });
    }
  });
  return teardown;
};
function forEachElement(node, cb) {
  if (isComment(node) && node.data === "[") {
    let depth = 1;
    let next = node.nextSibling;
    while (next) {
      if (next.nodeType === 1) {
        const result = cb(next);
        if (result === false) {
          break;
        }
      } else if (isComment(next)) {
        if (next.data === "]") {
          if (--depth === 0) break;
        } else if (next.data === "[") {
          depth++;
        }
      }
      next = next.nextSibling;
    }
  } else {
    cb(node);
  }
}
const isAsyncWrapper = (i) => !!i.type.__asyncLoader;
// @__NO_SIDE_EFFECTS__
function defineAsyncComponent(source) {
  if (isFunction(source)) {
    source = { loader: source };
  }
  const {
    loader,
    loadingComponent,
    errorComponent,
    delay: delay3 = 200,
    hydrate: hydrateStrategy,
    timeout,
    // undefined = never times out
    suspensible = true,
    onError: userOnError
  } = source;
  let pendingRequest = null;
  let resolvedComp;
  let retries = 0;
  const retry = () => {
    retries++;
    pendingRequest = null;
    return load();
  };
  const load = () => {
    let thisRequest;
    return pendingRequest || (thisRequest = pendingRequest = loader().catch((err) => {
      err = err instanceof Error ? err : new Error(String(err));
      if (userOnError) {
        return new Promise((resolve2, reject) => {
          const userRetry = () => resolve2(retry());
          const userFail = () => reject(err);
          userOnError(err, userRetry, userFail, retries + 1);
        });
      } else {
        throw err;
      }
    }).then((comp) => {
      if (thisRequest !== pendingRequest && pendingRequest) {
        return pendingRequest;
      }
      if (comp && (comp.__esModule || comp[Symbol.toStringTag] === "Module")) {
        comp = comp.default;
      }
      resolvedComp = comp;
      return comp;
    }));
  };
  return /* @__PURE__ */ defineComponent({
    name: "AsyncComponentWrapper",
    __asyncLoader: load,
    __asyncHydrate(el, instance, hydrate2) {
      const wasConnected = el.isConnected;
      let patched = false;
      (instance.bu || (instance.bu = [])).push(() => patched = true);
      const performHydrate = () => {
        if (patched) {
          return;
        }
        if (!el.parentNode || wasConnected && !el.isConnected) return;
        hydrate2();
      };
      const doHydrate = hydrateStrategy ? () => {
        const teardown = hydrateStrategy(
          performHydrate,
          (cb) => forEachElement(el, cb)
        );
        if (teardown) {
          (instance.bum || (instance.bum = [])).push(teardown);
        }
      } : performHydrate;
      if (resolvedComp) {
        doHydrate();
      } else {
        load().then(() => !instance.isUnmounted && doHydrate());
      }
    },
    get __asyncResolved() {
      return resolvedComp;
    },
    setup() {
      const instance = currentInstance;
      markAsyncBoundary(instance);
      if (resolvedComp) {
        return () => createInnerComp(resolvedComp, instance);
      }
      const onError = (err) => {
        pendingRequest = null;
        handleError(
          err,
          instance,
          13,
          !errorComponent
        );
      };
      if (suspensible && instance.suspense || isInSSRComponentSetup) {
        return load().then((comp) => {
          return () => createInnerComp(comp, instance);
        }).catch((err) => {
          onError(err);
          return () => errorComponent ? createVNode(errorComponent, {
            error: err
          }) : null;
        });
      }
      const loaded = /* @__PURE__ */ ref(false);
      const error = /* @__PURE__ */ ref();
      const delayed = /* @__PURE__ */ ref(!!delay3);
      let timeoutTimer;
      let delayTimer;
      onUnmounted(() => {
        if (timeoutTimer != null) clearTimeout(timeoutTimer);
        if (delayTimer != null) clearTimeout(delayTimer);
      });
      if (delay3) {
        delayTimer = setTimeout(() => {
          if (instance.isUnmounted) return;
          delayed.value = false;
        }, delay3);
      }
      if (timeout != null) {
        timeoutTimer = setTimeout(() => {
          if (instance.isUnmounted) return;
          if (!loaded.value && !error.value) {
            const err = new Error(
              `Async component timed out after ${timeout}ms.`
            );
            onError(err);
            error.value = err;
          }
        }, timeout);
      }
      load().then(() => {
        if (instance.isUnmounted) return;
        loaded.value = true;
        if (instance.parent && isKeepAlive(instance.parent.vnode)) {
          instance.parent.update();
        }
      }).catch((err) => {
        if (instance.isUnmounted) {
          pendingRequest = null;
          return;
        }
        onError(err);
        error.value = err;
      });
      return () => {
        if (loaded.value && resolvedComp) {
          return createInnerComp(resolvedComp, instance);
        } else if (error.value && errorComponent) {
          return createVNode(errorComponent, {
            error: error.value
          });
        } else if (loadingComponent && !delayed.value) {
          return createInnerComp(
            loadingComponent,
            instance
          );
        }
      };
    }
  });
}
function createInnerComp(comp, parent) {
  const { ref: ref22, props, children, ce } = parent.vnode;
  const vnode = createVNode(comp, props, children);
  vnode.ref = ref22;
  vnode.ce = ce;
  delete parent.vnode.ce;
  return vnode;
}
const isKeepAlive = (vnode) => vnode.type.__isKeepAlive;
const KeepAliveImpl = {
  name: `KeepAlive`,
  // Marker for special handling inside the renderer. We are not using a ===
  // check directly on KeepAlive in the renderer, because importing it directly
  // would prevent it from being tree-shaken.
  __isKeepAlive: true,
  props: {
    include: [String, RegExp, Array],
    exclude: [String, RegExp, Array],
    max: [String, Number]
  },
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const sharedContext = instance.ctx;
    if (!sharedContext.renderer) {
      return () => {
        const children = slots.default && slots.default();
        return children && children.length === 1 ? children[0] : children;
      };
    }
    const cache = /* @__PURE__ */ new Map();
    const keys = /* @__PURE__ */ new Set();
    let current = null;
    const parentSuspense = instance.suspense;
    const {
      renderer: {
        p: patch,
        m: move,
        um: _unmount,
        o: { createElement }
      }
    } = sharedContext;
    const storageContainer = createElement("div");
    sharedContext.activate = (vnode, container, anchor, namespace, optimized) => {
      const instance2 = vnode.component;
      move(vnode, container, anchor, 0, parentSuspense);
      patch(
        instance2.vnode,
        vnode,
        container,
        anchor,
        instance2,
        parentSuspense,
        namespace,
        vnode.slotScopeIds,
        optimized
      );
      queuePostRenderEffect(() => {
        instance2.isDeactivated = false;
        if (instance2.a) {
          invokeArrayFns(instance2.a);
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeMounted;
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance2.parent, vnode);
        }
      }, parentSuspense);
    };
    sharedContext.deactivate = (vnode) => {
      const instance2 = vnode.component;
      invalidateMount(instance2.m);
      invalidateMount(instance2.a);
      move(vnode, storageContainer, null, 1, parentSuspense);
      queuePostRenderEffect(() => {
        if (instance2.da) {
          invokeArrayFns(instance2.da);
        }
        const vnodeHook = vnode.props && vnode.props.onVnodeUnmounted;
        if (vnodeHook) {
          invokeVNodeHook(vnodeHook, instance2.parent, vnode);
        }
        instance2.isDeactivated = true;
      }, parentSuspense);
    };
    function unmount(vnode) {
      resetShapeFlag(vnode);
      _unmount(vnode, instance, parentSuspense, true);
    }
    function pruneCache(filter) {
      cache.forEach((vnode, key) => {
        const name = getComponentName(
          isAsyncWrapper(vnode) ? vnode.type.__asyncResolved || {} : vnode.type
        );
        if (name && !filter(name)) {
          pruneCacheEntry(key);
        }
      });
    }
    function pruneCacheEntry(key) {
      const cached = cache.get(key);
      if (cached && (!current || !isSameVNodeType(cached, current))) {
        unmount(cached);
      } else if (current) {
        resetShapeFlag(current);
      }
      cache.delete(key);
      keys.delete(key);
    }
    watch(
      () => [props.include, props.exclude],
      ([include, exclude]) => {
        include && pruneCache((name) => matches$1(include, name));
        exclude && pruneCache((name) => !matches$1(exclude, name));
      },
      // prune post-render after `current` has been updated
      { flush: "post", deep: true }
    );
    let pendingCacheKey = null;
    const cacheSubtree = () => {
      if (pendingCacheKey != null) {
        if (isSuspense(instance.subTree.type)) {
          queuePostRenderEffect(() => {
            cache.set(pendingCacheKey, getInnerChild(instance.subTree));
          }, instance.subTree.suspense);
        } else {
          cache.set(pendingCacheKey, getInnerChild(instance.subTree));
        }
      }
    };
    onMounted(cacheSubtree);
    onUpdated(cacheSubtree);
    onBeforeUnmount(() => {
      cache.forEach((cached) => {
        const { subTree, suspense } = instance;
        const vnode = getInnerChild(subTree);
        if (cached.type === vnode.type && cached.key === vnode.key) {
          resetShapeFlag(vnode);
          const da = vnode.component.da;
          da && queuePostRenderEffect(da, suspense);
          return;
        }
        unmount(cached);
      });
    });
    return () => {
      pendingCacheKey = null;
      if (!slots.default) {
        return current = null;
      }
      const children = slots.default();
      const rawVNode = children[0];
      if (children.length > 1) {
        current = null;
        return children;
      } else if (!isVNode(rawVNode) || !(rawVNode.shapeFlag & 4) && !(rawVNode.shapeFlag & 128)) {
        current = null;
        return rawVNode;
      }
      let vnode = getInnerChild(rawVNode);
      if (vnode.type === Comment) {
        current = null;
        return vnode;
      }
      const comp = vnode.type;
      const name = getComponentName(
        isAsyncWrapper(vnode) ? vnode.type.__asyncResolved || {} : comp
      );
      const { include, exclude, max } = props;
      if (include && (!name || !matches$1(include, name)) || exclude && name && matches$1(exclude, name)) {
        vnode.shapeFlag &= -257;
        current = vnode;
        return rawVNode;
      }
      const key = vnode.key == null ? comp : vnode.key;
      const cachedVNode = cache.get(key);
      if (vnode.el) {
        vnode = cloneVNode(vnode);
        if (rawVNode.shapeFlag & 128) {
          rawVNode.ssContent = vnode;
        }
      }
      pendingCacheKey = key;
      if (cachedVNode) {
        vnode.el = cachedVNode.el;
        vnode.component = cachedVNode.component;
        if (vnode.transition) {
          setTransitionHooks(vnode, vnode.transition);
        }
        vnode.shapeFlag |= 512;
        keys.delete(key);
        keys.add(key);
      } else {
        keys.add(key);
        if (max && keys.size > parseInt(max, 10)) {
          pruneCacheEntry(keys.values().next().value);
        }
      }
      vnode.shapeFlag |= 256;
      current = vnode;
      return isSuspense(rawVNode.type) ? rawVNode : vnode;
    };
  }
};
const KeepAlive = KeepAliveImpl;
function matches$1(pattern, name) {
  if (isArray(pattern)) {
    return pattern.some((p2) => matches$1(p2, name));
  } else if (isString(pattern)) {
    return pattern.split(",").includes(name);
  } else if (isRegExp(pattern)) {
    pattern.lastIndex = 0;
    return pattern.test(name);
  }
  return false;
}
function onActivated(hook, target) {
  registerKeepAliveHook(hook, "a", target);
}
function onDeactivated(hook, target) {
  registerKeepAliveHook(hook, "da", target);
}
function registerKeepAliveHook(hook, type, target = currentInstance) {
  const wrappedHook = hook.__wdc || (hook.__wdc = () => {
    let current = target;
    while (current) {
      if (current.isDeactivated) {
        return;
      }
      current = current.parent;
    }
    return hook();
  });
  injectHook(type, wrappedHook, target);
  if (target) {
    let current = target.parent;
    while (current && current.parent) {
      if (isKeepAlive(current.parent.vnode)) {
        injectToKeepAliveRoot(wrappedHook, type, target, current);
      }
      current = current.parent;
    }
  }
}
function injectToKeepAliveRoot(hook, type, target, keepAliveRoot) {
  const injected = injectHook(
    type,
    hook,
    keepAliveRoot,
    true
    /* prepend */
  );
  onUnmounted(() => {
    remove(keepAliveRoot[type], injected);
  }, target);
}
function resetShapeFlag(vnode) {
  vnode.shapeFlag &= -257;
  vnode.shapeFlag &= -513;
}
function getInnerChild(vnode) {
  return vnode.shapeFlag & 128 ? vnode.ssContent : vnode;
}
function injectHook(type, hook, target = currentInstance, prepend = false) {
  if (target) {
    const hooks = target[type] || (target[type] = []);
    const wrappedHook = hook.__weh || (hook.__weh = (...args) => {
      pauseTracking();
      const reset = setCurrentInstance(target);
      const res = callWithAsyncErrorHandling(hook, target, type, args);
      reset();
      resetTracking();
      return res;
    });
    if (prepend) {
      hooks.unshift(wrappedHook);
    } else {
      hooks.push(wrappedHook);
    }
    return wrappedHook;
  }
}
const createHook = (lifecycle) => (hook, target = currentInstance) => {
  if (!isInSSRComponentSetup || lifecycle === "sp") {
    injectHook(lifecycle, (...args) => hook(...args), target);
  }
};
const onBeforeMount = createHook("bm");
const onMounted = createHook("m");
const onBeforeUpdate = createHook(
  "bu"
);
const onUpdated = createHook("u");
const onBeforeUnmount = createHook(
  "bum"
);
const onUnmounted = createHook("um");
const onServerPrefetch = createHook(
  "sp"
);
const onRenderTriggered = createHook("rtg");
const onRenderTracked = createHook("rtc");
function onErrorCaptured(hook, target = currentInstance) {
  injectHook("ec", hook, target);
}
const COMPONENTS = "components";
const DIRECTIVES = "directives";
function resolveComponent(name, maybeSelfReference) {
  return resolveAsset(COMPONENTS, name, true, maybeSelfReference) || name;
}
const NULL_DYNAMIC_COMPONENT = /* @__PURE__ */ Symbol.for("v-ndc");
function resolveDynamicComponent(component) {
  if (isString(component)) {
    return resolveAsset(COMPONENTS, component, false) || component;
  } else {
    return component || NULL_DYNAMIC_COMPONENT;
  }
}
function resolveDirective(name) {
  return resolveAsset(DIRECTIVES, name);
}
function resolveAsset(type, name, warnMissing = true, maybeSelfReference = false) {
  const instance = currentRenderingInstance || currentInstance;
  if (instance) {
    const Component = instance.type;
    if (type === COMPONENTS) {
      const selfName = getComponentName(
        Component,
        false
      );
      if (selfName && (selfName === name || selfName === camelize(name) || selfName === capitalize(camelize(name)))) {
        return Component;
      }
    }
    const res = (
      // local registration
      // check instance[type] first which is resolved for options API
      resolve(instance[type] || Component[type], name) || // global registration
      resolve(instance.appContext[type], name)
    );
    if (!res && maybeSelfReference) {
      return Component;
    }
    return res;
  }
}
function resolve(registry, name) {
  return registry && (registry[name] || registry[camelize(name)] || registry[capitalize(camelize(name))]);
}
function renderList(source, renderItem, cache, index) {
  let ret;
  const cached = cache && cache[index];
  const sourceIsArray = isArray(source);
  if (sourceIsArray || isString(source)) {
    const sourceIsReactiveArray = sourceIsArray && /* @__PURE__ */ isReactive(source);
    let needsWrap = false;
    let isReadonlySource = false;
    if (sourceIsReactiveArray) {
      needsWrap = !/* @__PURE__ */ isShallow(source);
      isReadonlySource = /* @__PURE__ */ isReadonly(source);
      source = shallowReadArray(source);
    }
    ret = new Array(source.length);
    for (let i = 0, l = source.length; i < l; i++) {
      ret[i] = renderItem(
        needsWrap ? isReadonlySource ? toReadonly(toReactive(source[i])) : toReactive(source[i]) : source[i],
        i,
        void 0,
        cached && cached[i]
      );
    }
  } else if (typeof source === "number") {
    {
      ret = new Array(source);
      for (let i = 0; i < source; i++) {
        ret[i] = renderItem(i + 1, i, void 0, cached && cached[i]);
      }
    }
  } else if (isObject$2(source)) {
    if (source[Symbol.iterator]) {
      ret = Array.from(
        source,
        (item, i) => renderItem(item, i, void 0, cached && cached[i])
      );
    } else {
      const keys = Object.keys(source);
      ret = new Array(keys.length);
      for (let i = 0, l = keys.length; i < l; i++) {
        const key = keys[i];
        ret[i] = renderItem(source[key], key, i, cached && cached[i]);
      }
    }
  } else {
    ret = [];
  }
  if (cache) {
    cache[index] = ret;
  }
  return ret;
}
function createSlots(slots, dynamicSlots) {
  for (let i = 0; i < dynamicSlots.length; i++) {
    const slot = dynamicSlots[i];
    if (isArray(slot)) {
      for (let j = 0; j < slot.length; j++) {
        slots[slot[j].name] = slot[j].fn;
      }
    } else if (slot) {
      slots[slot.name] = slot.key ? (...args) => {
        const res = slot.fn(...args);
        if (res) res.key = slot.key;
        return res;
      } : slot.fn;
    }
  }
  return slots;
}
function renderSlot(slots, name, props = {}, fallback, noSlotted, branchKey) {
  if (currentRenderingInstance.ce || currentRenderingInstance.parent && isAsyncWrapper(currentRenderingInstance.parent) && currentRenderingInstance.parent.ce) {
    const slotProps = branchKey != null && props.key == null ? extend({}, props, { key: branchKey }) : props;
    const hasProps = Object.keys(slotProps).length > 0;
    if (name !== "default") slotProps.name = name;
    return openBlock(), createBlock(
      Fragment,
      null,
      [createVNode("slot", slotProps, fallback && fallback())],
      hasProps ? -2 : 64
    );
  }
  let slot = slots[name];
  if (slot && slot._c) {
    slot._d = false;
  }
  const prevStackSize = blockStack.length;
  openBlock();
  let rendered;
  try {
    const validSlotContent = slot && ensureValidVNode(slot(props));
    const slotKey = props.key || branchKey || // slot content array of a dynamic conditional slot may have a branch
    // key attached in the `createSlots` helper, respect that
    validSlotContent && validSlotContent.key;
    rendered = createBlock(
      Fragment,
      {
        key: (slotKey && !isSymbol(slotKey) ? slotKey : `_${name}`) + // #7256 force differentiate fallback content from actual content
        (!validSlotContent && fallback ? "_fb" : "")
      },
      validSlotContent || (fallback ? fallback() : []),
      validSlotContent && slots._ === 1 ? 64 : -2
    );
  } catch (err) {
    for (let i = blockStack.length; i > prevStackSize; i--) closeBlock();
    throw err;
  } finally {
    if (slot && slot._c) {
      slot._d = true;
    }
  }
  if (!noSlotted && rendered.scopeId) {
    rendered.slotScopeIds = [rendered.scopeId + "-s"];
  }
  return rendered;
}
function ensureValidVNode(vnodes) {
  return vnodes.some((child) => {
    if (!isVNode(child)) return true;
    if (child.type === Comment) return false;
    if (child.type === Fragment && !ensureValidVNode(child.children))
      return false;
    return true;
  }) ? vnodes : null;
}
function toHandlers(obj, preserveCaseIfNecessary) {
  const ret = {};
  for (const key in obj) {
    ret[preserveCaseIfNecessary && /[A-Z]/.test(key) ? `on:${key}` : toHandlerKey(key)] = obj[key];
  }
  return ret;
}
const getPublicInstance = (i) => {
  if (!i) return null;
  if (isStatefulComponent(i)) return getComponentPublicInstance(i);
  return getPublicInstance(i.parent);
};
const publicPropertiesMap = (
  // Move PURE marker to new line to workaround compiler discarding it
  // due to type annotation
  /* @__PURE__ */ extend(/* @__PURE__ */ Object.create(null), {
    $: (i) => i,
    $el: (i) => i.vnode.el,
    $data: (i) => i.data,
    $props: (i) => i.props,
    $attrs: (i) => i.attrs,
    $slots: (i) => i.slots,
    $refs: (i) => i.refs,
    $parent: (i) => getPublicInstance(i.parent),
    $root: (i) => getPublicInstance(i.root),
    $host: (i) => i.ce,
    $emit: (i) => i.emit,
    $options: (i) => resolveMergedOptions(i),
    $forceUpdate: (i) => i.f || (i.f = () => {
      queueJob(i.update);
    }),
    $nextTick: (i) => i.n || (i.n = nextTick.bind(i.proxy)),
    $watch: (i) => instanceWatch.bind(i)
  })
);
const hasSetupBinding = (state, key) => state !== EMPTY_OBJ && !state.__isScriptSetup && hasOwn(state, key);
const PublicInstanceProxyHandlers = {
  get({ _: instance }, key) {
    if (key === "__v_skip") {
      return true;
    }
    const { ctx, setupState, data, props, accessCache, type, appContext } = instance;
    if (key[0] !== "$") {
      const n = accessCache[key];
      if (n !== void 0) {
        switch (n) {
          case 1:
            return setupState[key];
          case 2:
            return data[key];
          case 4:
            return ctx[key];
          case 3:
            return props[key];
        }
      } else if (hasSetupBinding(setupState, key)) {
        accessCache[key] = 1;
        return setupState[key];
      } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
        accessCache[key] = 2;
        return data[key];
      } else if (hasOwn(props, key)) {
        accessCache[key] = 3;
        return props[key];
      } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
        accessCache[key] = 4;
        return ctx[key];
      } else if (shouldCacheAccess) {
        accessCache[key] = 0;
      }
    }
    const publicGetter = publicPropertiesMap[key];
    let cssModule, globalProperties;
    if (publicGetter) {
      if (key === "$attrs") {
        track(instance.attrs, "get", "");
      }
      return publicGetter(instance);
    } else if (
      // css module (injected by vue-loader)
      (cssModule = type.__cssModules) && (cssModule = cssModule[key])
    ) {
      return cssModule;
    } else if (ctx !== EMPTY_OBJ && hasOwn(ctx, key)) {
      accessCache[key] = 4;
      return ctx[key];
    } else if (
      // global properties
      globalProperties = appContext.config.globalProperties, hasOwn(globalProperties, key)
    ) {
      {
        return globalProperties[key];
      }
    } else ;
  },
  set({ _: instance }, key, value) {
    const { data, setupState, ctx } = instance;
    if (hasSetupBinding(setupState, key)) {
      setupState[key] = value;
      return true;
    } else if (data !== EMPTY_OBJ && hasOwn(data, key)) {
      data[key] = value;
      return true;
    } else if (hasOwn(instance.props, key)) {
      return false;
    }
    if (key[0] === "$" && key.slice(1) in instance) {
      return false;
    } else {
      {
        ctx[key] = value;
      }
    }
    return true;
  },
  has({
    _: { data, setupState, accessCache, ctx, appContext, props, type }
  }, key) {
    let cssModules;
    return !!(accessCache[key] || data !== EMPTY_OBJ && key[0] !== "$" && hasOwn(data, key) || hasSetupBinding(setupState, key) || hasOwn(props, key) || hasOwn(ctx, key) || hasOwn(publicPropertiesMap, key) || hasOwn(appContext.config.globalProperties, key) || (cssModules = type.__cssModules) && cssModules[key]);
  },
  defineProperty(target, key, descriptor) {
    if (descriptor.get != null) {
      target._.accessCache[key] = 0;
    } else if (hasOwn(descriptor, "value")) {
      this.set(target, key, descriptor.value, null);
    }
    return Reflect.defineProperty(target, key, descriptor);
  }
};
const RuntimeCompiledPublicInstanceProxyHandlers = /* @__PURE__ */ extend({}, PublicInstanceProxyHandlers, {
  get(target, key) {
    if (key === Symbol.unscopables) {
      return;
    }
    return PublicInstanceProxyHandlers.get(target, key, target);
  },
  has(_, key) {
    const has = key[0] !== "_" && !isGloballyAllowed(key);
    return has;
  }
});
function defineProps() {
  return null;
}
function defineEmits() {
  return null;
}
function defineExpose(exposed) {
}
function defineOptions(options) {
}
function defineSlots() {
  return null;
}
function defineModel() {
}
function withDefaults(props, defaults) {
  return null;
}
function useSlots() {
  return getContext().slots;
}
function useAttrs() {
  return getContext().attrs;
}
function getContext(calledFunctionName) {
  const i = getCurrentInstance();
  return i.setupContext || (i.setupContext = createSetupContext(i));
}
function normalizePropsOrEmits(props) {
  return isArray(props) ? props.reduce(
    (normalized, p2) => (normalized[p2] = null, normalized),
    {}
  ) : props;
}
function mergeDefaults(raw, defaults) {
  const props = normalizePropsOrEmits(raw);
  for (const key in defaults) {
    if (key.startsWith("__skip")) continue;
    let opt = props[key];
    if (opt) {
      if (isArray(opt) || isFunction(opt)) {
        opt = props[key] = { type: opt, default: defaults[key] };
      } else {
        opt.default = defaults[key];
      }
    } else if (opt === null) {
      opt = props[key] = { default: defaults[key] };
    } else ;
    if (opt && defaults[`__skip_${key}`]) {
      opt.skipFactory = true;
    }
  }
  return props;
}
function mergeModels(a, b) {
  if (!a || !b) return a || b;
  if (isArray(a) && isArray(b)) return a.concat(b);
  return extend({}, normalizePropsOrEmits(a), normalizePropsOrEmits(b));
}
function createPropsRestProxy(props, excludedKeys) {
  const ret = {};
  for (const key in props) {
    if (!excludedKeys.includes(key)) {
      Object.defineProperty(ret, key, {
        enumerable: true,
        get: () => props[key]
      });
    }
  }
  return ret;
}
function withAsyncContext(getAwaitable) {
  const ctx = getCurrentInstance();
  const inSSRSetup = isInSSRComponentSetup;
  let awaitable = getAwaitable();
  unsetCurrentInstance();
  if (inSSRSetup) {
    setInSSRSetupState(false);
  }
  const restore = () => {
    setCurrentInstance(ctx);
    if (inSSRSetup) {
      setInSSRSetupState(true);
    }
  };
  const cleanup = () => {
    if (getCurrentInstance() !== ctx) ctx.scope.off();
    unsetCurrentInstance();
    if (inSSRSetup) {
      setInSSRSetupState(false);
    }
  };
  if (isPromise(awaitable)) {
    awaitable = awaitable.catch((e) => {
      restore();
      Promise.resolve().then(() => Promise.resolve().then(cleanup));
      throw e;
    });
  }
  return [
    awaitable,
    () => {
      restore();
      Promise.resolve().then(cleanup);
    }
  ];
}
let shouldCacheAccess = true;
function applyOptions(instance) {
  const options = resolveMergedOptions(instance);
  const publicThis = instance.proxy;
  const ctx = instance.ctx;
  shouldCacheAccess = false;
  if (options.beforeCreate) {
    callHook$1(options.beforeCreate, instance, "bc");
  }
  const {
    // state
    data: dataOptions,
    computed: computedOptions,
    methods,
    watch: watchOptions,
    provide: provideOptions,
    inject: injectOptions,
    // lifecycle
    created,
    beforeMount,
    mounted,
    beforeUpdate,
    updated,
    activated,
    deactivated,
    beforeDestroy,
    beforeUnmount,
    destroyed,
    unmounted,
    render: render2,
    renderTracked,
    renderTriggered,
    errorCaptured,
    serverPrefetch,
    // public API
    expose,
    inheritAttrs,
    // assets
    components,
    directives,
    filters
  } = options;
  const checkDuplicateProperties = null;
  if (injectOptions) {
    resolveInjections(injectOptions, ctx, checkDuplicateProperties);
  }
  if (methods) {
    for (const key in methods) {
      const methodHandler = methods[key];
      if (isFunction(methodHandler)) {
        {
          ctx[key] = methodHandler.bind(publicThis);
        }
      }
    }
  }
  if (dataOptions) {
    const data = dataOptions.call(publicThis, publicThis);
    if (!isObject$2(data)) ;
    else {
      instance.data = /* @__PURE__ */ reactive(data);
    }
  }
  shouldCacheAccess = true;
  if (computedOptions) {
    for (const key in computedOptions) {
      const opt = computedOptions[key];
      const get2 = isFunction(opt) ? opt.bind(publicThis, publicThis) : isFunction(opt.get) ? opt.get.bind(publicThis, publicThis) : NOOP;
      const set2 = !isFunction(opt) && isFunction(opt.set) ? opt.set.bind(publicThis) : NOOP;
      const c = computed({
        get: get2,
        set: set2
      });
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => c.value,
        set: (v) => c.value = v
      });
    }
  }
  if (watchOptions) {
    for (const key in watchOptions) {
      createWatcher(watchOptions[key], ctx, publicThis, key);
    }
  }
  if (provideOptions) {
    const provides = isFunction(provideOptions) ? provideOptions.call(publicThis) : provideOptions;
    Reflect.ownKeys(provides).forEach((key) => {
      provide(key, provides[key]);
    });
  }
  if (created) {
    callHook$1(created, instance, "c");
  }
  function registerLifecycleHook(register, hook) {
    if (isArray(hook)) {
      hook.forEach((_hook) => register(_hook.bind(publicThis)));
    } else if (hook) {
      register(hook.bind(publicThis));
    }
  }
  registerLifecycleHook(onBeforeMount, beforeMount);
  registerLifecycleHook(onMounted, mounted);
  registerLifecycleHook(onBeforeUpdate, beforeUpdate);
  registerLifecycleHook(onUpdated, updated);
  registerLifecycleHook(onActivated, activated);
  registerLifecycleHook(onDeactivated, deactivated);
  registerLifecycleHook(onErrorCaptured, errorCaptured);
  registerLifecycleHook(onRenderTracked, renderTracked);
  registerLifecycleHook(onRenderTriggered, renderTriggered);
  registerLifecycleHook(onBeforeUnmount, beforeUnmount);
  registerLifecycleHook(onUnmounted, unmounted);
  registerLifecycleHook(onServerPrefetch, serverPrefetch);
  if (isArray(expose)) {
    if (expose.length) {
      const exposed = instance.exposed || (instance.exposed = {});
      expose.forEach((key) => {
        Object.defineProperty(exposed, key, {
          get: () => publicThis[key],
          set: (val) => publicThis[key] = val,
          enumerable: true
        });
      });
    } else if (!instance.exposed) {
      instance.exposed = {};
    }
  }
  if (render2 && instance.render === NOOP) {
    instance.render = render2;
  }
  if (inheritAttrs != null) {
    instance.inheritAttrs = inheritAttrs;
  }
  if (components) instance.components = components;
  if (directives) instance.directives = directives;
  if (serverPrefetch) {
    markAsyncBoundary(instance);
  }
}
function resolveInjections(injectOptions, ctx, checkDuplicateProperties = NOOP) {
  if (isArray(injectOptions)) {
    injectOptions = normalizeInject(injectOptions);
  }
  for (const key in injectOptions) {
    const opt = injectOptions[key];
    let injected;
    if (isObject$2(opt)) {
      if ("default" in opt) {
        injected = inject(
          opt.from || key,
          opt.default,
          true
        );
      } else {
        injected = inject(opt.from || key);
      }
    } else {
      injected = inject(opt);
    }
    if (/* @__PURE__ */ isRef(injected)) {
      Object.defineProperty(ctx, key, {
        enumerable: true,
        configurable: true,
        get: () => injected.value,
        set: (v) => injected.value = v
      });
    } else {
      ctx[key] = injected;
    }
  }
}
function callHook$1(hook, instance, type) {
  callWithAsyncErrorHandling(
    isArray(hook) ? hook.map((h2) => h2.bind(instance.proxy)) : hook.bind(instance.proxy),
    instance,
    type
  );
}
function createWatcher(raw, ctx, publicThis, key) {
  let getter = key.includes(".") ? createPathGetter(publicThis, key) : () => publicThis[key];
  if (isString(raw)) {
    const handler = ctx[raw];
    if (isFunction(handler)) {
      {
        watch(getter, handler);
      }
    }
  } else if (isFunction(raw)) {
    {
      watch(getter, raw.bind(publicThis));
    }
  } else if (isObject$2(raw)) {
    if (isArray(raw)) {
      raw.forEach((r) => createWatcher(r, ctx, publicThis, key));
    } else {
      const handler = isFunction(raw.handler) ? raw.handler.bind(publicThis) : ctx[raw.handler];
      if (isFunction(handler)) {
        watch(getter, handler, raw);
      }
    }
  } else ;
}
function resolveMergedOptions(instance) {
  const base = instance.type;
  const { mixins, extends: extendsOptions } = base;
  const {
    mixins: globalMixins,
    optionsCache: cache,
    config: { optionMergeStrategies }
  } = instance.appContext;
  const cached = cache.get(base);
  let resolved;
  if (cached) {
    resolved = cached;
  } else if (!globalMixins.length && !mixins && !extendsOptions) {
    {
      resolved = base;
    }
  } else {
    resolved = {};
    if (globalMixins.length) {
      globalMixins.forEach(
        (m) => mergeOptions(resolved, m, optionMergeStrategies, true)
      );
    }
    mergeOptions(resolved, base, optionMergeStrategies);
  }
  if (isObject$2(base)) {
    cache.set(base, resolved);
  }
  return resolved;
}
function mergeOptions(to, from, strats, asMixin = false) {
  const { mixins, extends: extendsOptions } = from;
  if (extendsOptions) {
    mergeOptions(to, extendsOptions, strats, true);
  }
  if (mixins) {
    mixins.forEach(
      (m) => mergeOptions(to, m, strats, true)
    );
  }
  for (const key in from) {
    if (asMixin && key === "expose") ;
    else {
      const strat = internalOptionMergeStrats[key] || strats && strats[key];
      to[key] = strat ? strat(to[key], from[key]) : from[key];
    }
  }
  return to;
}
const internalOptionMergeStrats = {
  data: mergeDataFn,
  props: mergeEmitsOrPropsOptions,
  emits: mergeEmitsOrPropsOptions,
  // objects
  methods: mergeObjectOptions,
  computed: mergeObjectOptions,
  // lifecycle
  beforeCreate: mergeAsArray,
  created: mergeAsArray,
  beforeMount: mergeAsArray,
  mounted: mergeAsArray,
  beforeUpdate: mergeAsArray,
  updated: mergeAsArray,
  beforeDestroy: mergeAsArray,
  beforeUnmount: mergeAsArray,
  destroyed: mergeAsArray,
  unmounted: mergeAsArray,
  activated: mergeAsArray,
  deactivated: mergeAsArray,
  errorCaptured: mergeAsArray,
  serverPrefetch: mergeAsArray,
  // assets
  components: mergeObjectOptions,
  directives: mergeObjectOptions,
  // watch
  watch: mergeWatchOptions,
  // provide / inject
  provide: mergeDataFn,
  inject: mergeInject
};
function mergeDataFn(to, from) {
  if (!from) {
    return to;
  }
  if (!to) {
    return from;
  }
  return function mergedDataFn() {
    return extend(
      isFunction(to) ? to.call(this, this) : to,
      isFunction(from) ? from.call(this, this) : from
    );
  };
}
function mergeInject(to, from) {
  return mergeObjectOptions(normalizeInject(to), normalizeInject(from));
}
function normalizeInject(raw) {
  if (isArray(raw)) {
    const res = {};
    for (let i = 0; i < raw.length; i++) {
      res[raw[i]] = raw[i];
    }
    return res;
  }
  return raw;
}
function mergeAsArray(to, from) {
  return to ? [...new Set([].concat(to, from))] : from;
}
function mergeObjectOptions(to, from) {
  return to ? extend(/* @__PURE__ */ Object.create(null), to, from) : from;
}
function mergeEmitsOrPropsOptions(to, from) {
  if (to) {
    if (isArray(to) && isArray(from)) {
      return [.../* @__PURE__ */ new Set([...to, ...from])];
    }
    return extend(
      /* @__PURE__ */ Object.create(null),
      normalizePropsOrEmits(to),
      normalizePropsOrEmits(from != null ? from : {})
    );
  } else {
    return from;
  }
}
function mergeWatchOptions(to, from) {
  if (!to) return from;
  if (!from) return to;
  const merged = extend(/* @__PURE__ */ Object.create(null), to);
  for (const key in from) {
    merged[key] = mergeAsArray(to[key], from[key]);
  }
  return merged;
}
function createAppContext() {
  return {
    app: null,
    config: {
      isNativeTag: NO,
      performance: false,
      globalProperties: {},
      optionMergeStrategies: {},
      errorHandler: void 0,
      warnHandler: void 0,
      compilerOptions: {}
    },
    mixins: [],
    components: {},
    directives: {},
    provides: /* @__PURE__ */ Object.create(null),
    optionsCache: /* @__PURE__ */ new WeakMap(),
    propsCache: /* @__PURE__ */ new WeakMap(),
    emitsCache: /* @__PURE__ */ new WeakMap()
  };
}
let uid$1 = 0;
function createAppAPI(render2, hydrate2) {
  return function createApp2(rootComponent, rootProps = null) {
    if (!isFunction(rootComponent)) {
      rootComponent = extend({}, rootComponent);
    }
    if (rootProps != null && !isObject$2(rootProps)) {
      rootProps = null;
    }
    const context = createAppContext();
    const installedPlugins = /* @__PURE__ */ new WeakSet();
    const pluginCleanupFns = [];
    let isMounted = false;
    const app = context.app = {
      _uid: uid$1++,
      _component: rootComponent,
      _props: rootProps,
      _container: null,
      _context: context,
      _instance: null,
      version,
      get config() {
        return context.config;
      },
      set config(v) {
      },
      use(plugin, ...options) {
        if (installedPlugins.has(plugin)) ;
        else if (plugin && isFunction(plugin.install)) {
          installedPlugins.add(plugin);
          plugin.install(app, ...options);
        } else if (isFunction(plugin)) {
          installedPlugins.add(plugin);
          plugin(app, ...options);
        } else ;
        return app;
      },
      mixin(mixin) {
        {
          if (!context.mixins.includes(mixin)) {
            context.mixins.push(mixin);
          }
        }
        return app;
      },
      component(name, component) {
        if (!component) {
          return context.components[name];
        }
        context.components[name] = component;
        return app;
      },
      directive(name, directive) {
        if (!directive) {
          return context.directives[name];
        }
        context.directives[name] = directive;
        return app;
      },
      mount(rootContainer, isHydrate, namespace) {
        if (!isMounted) {
          const vnode = app._ceVNode || createVNode(rootComponent, rootProps);
          vnode.appContext = context;
          if (namespace === true) {
            namespace = "svg";
          } else if (namespace === false) {
            namespace = void 0;
          }
          if (isHydrate && hydrate2) {
            hydrate2(vnode, rootContainer);
          } else {
            render2(vnode, rootContainer, namespace);
          }
          isMounted = true;
          app._container = rootContainer;
          rootContainer.__vue_app__ = app;
          return getComponentPublicInstance(vnode.component);
        }
      },
      onUnmount(cleanupFn) {
        pluginCleanupFns.push(cleanupFn);
      },
      unmount() {
        if (isMounted) {
          callWithAsyncErrorHandling(
            pluginCleanupFns,
            app._instance,
            16
          );
          render2(null, app._container);
          delete app._container.__vue_app__;
        }
      },
      provide(key, value) {
        context.provides[key] = value;
        return app;
      },
      runWithContext(fn) {
        const lastApp = currentApp;
        currentApp = app;
        try {
          return fn();
        } finally {
          currentApp = lastApp;
        }
      }
    };
    return app;
  };
}
let currentApp = null;
function useModel(props, name, options = EMPTY_OBJ) {
  const i = getCurrentInstance();
  const camelizedName = camelize(name);
  const hyphenatedName = hyphenate(name);
  const modifiers = getModelModifiers(props, camelizedName);
  const res = customRef((track2, trigger2) => {
    let localValue;
    let prevSetValue = EMPTY_OBJ;
    let prevEmittedValue;
    watchSyncEffect(() => {
      const propValue = props[camelizedName];
      if (hasChanged(localValue, propValue)) {
        localValue = propValue;
        trigger2();
      }
    });
    return {
      get() {
        track2();
        return options.get ? options.get(localValue) : localValue;
      },
      set(value) {
        const emittedValue = options.set ? options.set(value) : value;
        if (!hasChanged(emittedValue, localValue) && !(prevSetValue !== EMPTY_OBJ && hasChanged(value, prevSetValue))) {
          return;
        }
        const rawProps = i.vnode.props;
        const hasVModel = !!(rawProps && // check if parent has passed v-model
        (name in rawProps || camelizedName in rawProps || hyphenatedName in rawProps) && (`onUpdate:${name}` in rawProps || `onUpdate:${camelizedName}` in rawProps || `onUpdate:${hyphenatedName}` in rawProps));
        if (!hasVModel) {
          localValue = value;
          trigger2();
        }
        i.emit(`update:${name}`, emittedValue);
        if (hasChanged(value, prevSetValue) && (hasChanged(value, emittedValue) && !hasChanged(emittedValue, prevEmittedValue) || // #13524: browsers differ in when they flush microtasks between
        // event listeners. If a v-model listener emits an intermediate value
        // and a following listener restores the model to its previous prop
        // value before parent updates are flushed, the parent render can be
        // deduped as having no prop change. Force a local update so DOM state
        // such as an input's value is synchronized back to the current model.
        hasVModel && prevSetValue !== EMPTY_OBJ && !hasChanged(emittedValue, localValue))) {
          trigger2();
        }
        prevSetValue = value;
        prevEmittedValue = emittedValue;
      }
    };
  });
  res[Symbol.iterator] = () => {
    let i2 = 0;
    return {
      next() {
        if (i2 < 2) {
          return { value: i2++ ? modifiers || EMPTY_OBJ : res, done: false };
        } else {
          return { done: true };
        }
      }
    };
  };
  return res;
}
const getModelModifiers = (props, modelName) => {
  return modelName === "modelValue" || modelName === "model-value" ? props.modelModifiers : props[`${modelName}Modifiers`] || props[`${camelize(modelName)}Modifiers`] || props[`${hyphenate(modelName)}Modifiers`];
};
function emit(instance, event, ...rawArgs) {
  if (instance.isUnmounted) return;
  const props = instance.vnode.props || EMPTY_OBJ;
  let args = rawArgs;
  const isModelListener2 = event.startsWith("update:");
  const modifiers = isModelListener2 && getModelModifiers(props, event.slice(7));
  if (modifiers) {
    if (modifiers.trim) {
      args = rawArgs.map((a) => isString(a) ? a.trim() : a);
    }
    if (modifiers.number) {
      args = rawArgs.map(looseToNumber);
    }
  }
  let handlerName;
  let handler = props[handlerName = toHandlerKey(event)] || // also try camelCase event handler (#2249)
  props[handlerName = toHandlerKey(camelize(event))];
  if (!handler && isModelListener2) {
    handler = props[handlerName = toHandlerKey(hyphenate(event))];
  }
  if (handler) {
    callWithAsyncErrorHandling(
      handler,
      instance,
      6,
      args
    );
  }
  const onceHandler = props[handlerName + `Once`];
  if (onceHandler) {
    if (!instance.emitted) {
      instance.emitted = {};
    } else if (instance.emitted[handlerName]) {
      return;
    }
    instance.emitted[handlerName] = true;
    callWithAsyncErrorHandling(
      onceHandler,
      instance,
      6,
      args
    );
  }
}
const mixinEmitsCache = /* @__PURE__ */ new WeakMap();
function normalizeEmitsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinEmitsCache : appContext.emitsCache;
  const cached = cache.get(comp);
  if (cached !== void 0) {
    return cached;
  }
  const raw = comp.emits;
  let normalized = {};
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendEmits = (raw2) => {
      const normalizedFromExtend = normalizeEmitsOptions(raw2, appContext, true);
      if (normalizedFromExtend) {
        hasExtends = true;
        extend(normalized, normalizedFromExtend);
      }
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendEmits);
    }
    if (comp.extends) {
      extendEmits(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendEmits);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject$2(comp)) {
      cache.set(comp, null);
    }
    return null;
  }
  if (isArray(raw)) {
    raw.forEach((key) => normalized[key] = null);
  } else {
    extend(normalized, raw);
  }
  if (isObject$2(comp)) {
    cache.set(comp, normalized);
  }
  return normalized;
}
function isEmitListener(options, key) {
  if (!options || !isOn(key)) {
    return false;
  }
  key = key.slice(2);
  key = key === "Once" ? key : key.replace(/Once$/, "");
  return hasOwn(options, key[0].toLowerCase() + key.slice(1)) || hasOwn(options, hyphenate(key)) || hasOwn(options, key);
}
function markAttrsAccessed() {
}
function renderComponentRoot(instance) {
  const {
    type: Component,
    vnode,
    proxy,
    withProxy,
    propsOptions: [propsOptions],
    slots,
    attrs,
    emit: emit2,
    render: render2,
    renderCache,
    props,
    data,
    setupState,
    ctx,
    inheritAttrs
  } = instance;
  const prev = setCurrentRenderingInstance(instance);
  let result;
  let fallthroughAttrs;
  try {
    if (vnode.shapeFlag & 4) {
      const proxyToUse = withProxy || proxy;
      const thisProxy = false ? new Proxy(proxyToUse, {
        get(target, key, receiver) {
          warn$1(
            `Property '${String(
              key
            )}' was accessed via 'this'. Avoid using 'this' in templates.`
          );
          return Reflect.get(target, key, receiver);
        }
      }) : proxyToUse;
      result = normalizeVNode(
        render2.call(
          thisProxy,
          proxyToUse,
          renderCache,
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          setupState,
          data,
          ctx
        )
      );
      fallthroughAttrs = attrs;
    } else {
      const render22 = Component;
      if (false) ;
      result = normalizeVNode(
        render22.length > 1 ? render22(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          false ? {
            get attrs() {
              markAttrsAccessed();
              return /* @__PURE__ */ shallowReadonly(attrs);
            },
            slots,
            emit: emit2
          } : { attrs, slots, emit: emit2 }
        ) : render22(
          false ? /* @__PURE__ */ shallowReadonly(props) : props,
          null
        )
      );
      fallthroughAttrs = Component.props ? attrs : getFunctionalFallthrough(attrs);
    }
  } catch (err) {
    blockStack.length = 0;
    handleError(err, instance, 1);
    result = createVNode(Comment);
  }
  let root = result;
  if (fallthroughAttrs && inheritAttrs !== false) {
    const keys = Object.keys(fallthroughAttrs);
    const { shapeFlag } = root;
    if (keys.length) {
      if (shapeFlag & (1 | 6)) {
        if (propsOptions && keys.some(isModelListener)) {
          fallthroughAttrs = filterModelListeners(
            fallthroughAttrs,
            propsOptions
          );
        }
        root = cloneVNode(root, fallthroughAttrs, false, true);
      }
    }
  }
  if (vnode.dirs) {
    root = cloneVNode(root, null, false, true);
    root.dirs = root.dirs ? root.dirs.concat(vnode.dirs) : vnode.dirs;
  }
  if (vnode.transition) {
    setTransitionHooks(root, vnode.transition);
  }
  {
    result = root;
  }
  setCurrentRenderingInstance(prev);
  return result;
}
function filterSingleRoot(children, recurse = true) {
  let singleRoot;
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (isVNode(child)) {
      if (child.type !== Comment || child.children === "v-if") {
        if (singleRoot) {
          return;
        } else {
          singleRoot = child;
        }
      }
    } else {
      return;
    }
  }
  return singleRoot;
}
const getFunctionalFallthrough = (attrs) => {
  let res;
  for (const key in attrs) {
    if (key === "class" || key === "style" || isOn(key)) {
      (res || (res = {}))[key] = attrs[key];
    }
  }
  return res;
};
const filterModelListeners = (attrs, props) => {
  const res = {};
  for (const key in attrs) {
    if (!isModelListener(key) || !(key.slice(9) in props)) {
      res[key] = attrs[key];
    }
  }
  return res;
};
function shouldUpdateComponent(prevVNode, nextVNode, optimized) {
  const { props: prevProps, children: prevChildren, component } = prevVNode;
  const { props: nextProps, children: nextChildren, patchFlag } = nextVNode;
  const emits = component.emitsOptions;
  if (nextVNode.dirs || nextVNode.transition) {
    return true;
  }
  if (optimized && patchFlag >= 0) {
    if (patchFlag & 1024) {
      return true;
    }
    if (patchFlag & 16) {
      if (!prevProps) {
        return !!nextProps;
      }
      return hasPropsChanged(prevProps, nextProps, emits);
    } else if (patchFlag & 8) {
      const dynamicProps = nextVNode.dynamicProps;
      for (let i = 0; i < dynamicProps.length; i++) {
        const key = dynamicProps[i];
        if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emits, key)) {
          return true;
        }
      }
    }
  } else {
    if (prevChildren || nextChildren) {
      if (!nextChildren || !nextChildren.$stable) {
        return true;
      }
    }
    if (prevProps === nextProps) {
      return false;
    }
    if (!prevProps) {
      return !!nextProps;
    }
    if (!nextProps) {
      return true;
    }
    return hasPropsChanged(prevProps, nextProps, emits);
  }
  return false;
}
function hasPropsChanged(prevProps, nextProps, emitsOptions) {
  const nextKeys = Object.keys(nextProps);
  if (nextKeys.length !== Object.keys(prevProps).length) {
    return true;
  }
  for (let i = 0; i < nextKeys.length; i++) {
    const key = nextKeys[i];
    if (hasPropValueChanged(nextProps, prevProps, key) && !isEmitListener(emitsOptions, key)) {
      return true;
    }
  }
  return false;
}
function hasPropValueChanged(nextProps, prevProps, key) {
  const nextProp = nextProps[key];
  const prevProp = prevProps[key];
  if (key === "style" && isObject$2(nextProp) && isObject$2(prevProp)) {
    return !looseEqual(nextProp, prevProp);
  }
  return nextProp !== prevProp;
}
function updateHOCHostEl({ vnode, parent, suspense }, el) {
  while (parent) {
    const root = parent.subTree;
    if (root.suspense && root.suspense.activeBranch === vnode) {
      root.suspense.vnode.el = root.el = el;
      vnode = root;
    }
    if (root === vnode) {
      (vnode = parent.vnode).el = el;
      parent = parent.parent;
    } else {
      break;
    }
  }
  if (suspense && suspense.activeBranch === vnode) {
    suspense.vnode.el = el;
  }
}
const internalObjectProto = {};
const createInternalObject = () => Object.create(internalObjectProto);
const isInternalObject = (obj) => Object.getPrototypeOf(obj) === internalObjectProto;
function initProps(instance, rawProps, isStateful, isSSR = false) {
  const props = {};
  const attrs = createInternalObject();
  instance.propsDefaults = /* @__PURE__ */ Object.create(null);
  setFullProps(instance, rawProps, props, attrs);
  for (const key in instance.propsOptions[0]) {
    if (!(key in props)) {
      props[key] = void 0;
    }
  }
  if (isStateful) {
    instance.props = isSSR ? props : /* @__PURE__ */ shallowReactive(props);
  } else {
    if (!instance.type.props) {
      instance.props = attrs;
    } else {
      instance.props = props;
    }
  }
  instance.attrs = attrs;
}
function updateProps(instance, rawProps, rawPrevProps, optimized) {
  const {
    props,
    attrs,
    vnode: { patchFlag }
  } = instance;
  const rawCurrentProps = /* @__PURE__ */ toRaw(props);
  const [options] = instance.propsOptions;
  let hasAttrsChanged = false;
  if (
    // always force full diff in dev
    // - #1942 if hmr is enabled with sfc component
    // - vite#872 non-sfc component used by sfc component
    (optimized || patchFlag > 0) && !(patchFlag & 16)
  ) {
    if (patchFlag & 8) {
      const propsToUpdate = instance.vnode.dynamicProps;
      for (let i = 0; i < propsToUpdate.length; i++) {
        let key = propsToUpdate[i];
        if (isEmitListener(instance.emitsOptions, key)) {
          continue;
        }
        const value = rawProps[key];
        if (options) {
          if (hasOwn(attrs, key)) {
            if (value !== attrs[key]) {
              attrs[key] = value;
              hasAttrsChanged = true;
            }
          } else {
            const camelizedKey = camelize(key);
            props[camelizedKey] = resolvePropValue(
              options,
              rawCurrentProps,
              camelizedKey,
              value,
              instance,
              false
            );
          }
        } else {
          if (value !== attrs[key]) {
            attrs[key] = value;
            hasAttrsChanged = true;
          }
        }
      }
    }
  } else {
    if (setFullProps(instance, rawProps, props, attrs)) {
      hasAttrsChanged = true;
    }
    let kebabKey;
    for (const key in rawCurrentProps) {
      if (!rawProps || // for camelCase
      !hasOwn(rawProps, key) && // it's possible the original props was passed in as kebab-case
      // and converted to camelCase (#955)
      ((kebabKey = hyphenate(key)) === key || !hasOwn(rawProps, kebabKey))) {
        if (options) {
          if (rawPrevProps && // for camelCase
          (rawPrevProps[key] !== void 0 || // for kebab-case
          rawPrevProps[kebabKey] !== void 0)) {
            props[key] = resolvePropValue(
              options,
              rawCurrentProps,
              key,
              void 0,
              instance,
              true
            );
          }
        } else {
          delete props[key];
        }
      }
    }
    if (attrs !== rawCurrentProps) {
      for (const key in attrs) {
        if (!rawProps || !hasOwn(rawProps, key) && true) {
          delete attrs[key];
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (hasAttrsChanged) {
    trigger(instance.attrs, "set", "");
  }
}
function setFullProps(instance, rawProps, props, attrs) {
  const [options, needCastKeys] = instance.propsOptions;
  let hasAttrsChanged = false;
  let rawCastValues;
  if (rawProps) {
    for (let key in rawProps) {
      if (isReservedProp(key)) {
        continue;
      }
      const value = rawProps[key];
      let camelKey;
      if (options && hasOwn(options, camelKey = camelize(key))) {
        if (!needCastKeys || !needCastKeys.includes(camelKey)) {
          props[camelKey] = value;
        } else {
          (rawCastValues || (rawCastValues = {}))[camelKey] = value;
        }
      } else if (!isEmitListener(instance.emitsOptions, key)) {
        if (!(key in attrs) || value !== attrs[key]) {
          attrs[key] = value;
          hasAttrsChanged = true;
        }
      }
    }
  }
  if (needCastKeys) {
    const rawCurrentProps = /* @__PURE__ */ toRaw(props);
    const castValues = rawCastValues || EMPTY_OBJ;
    for (let i = 0; i < needCastKeys.length; i++) {
      const key = needCastKeys[i];
      props[key] = resolvePropValue(
        options,
        rawCurrentProps,
        key,
        castValues[key],
        instance,
        !hasOwn(castValues, key)
      );
    }
  }
  return hasAttrsChanged;
}
function resolvePropValue(options, props, key, value, instance, isAbsent) {
  const opt = options[key];
  if (opt != null) {
    const hasDefault = hasOwn(opt, "default");
    if (hasDefault && value === void 0) {
      const defaultValue = opt.default;
      if (opt.type !== Function && !opt.skipFactory && isFunction(defaultValue)) {
        const { propsDefaults } = instance;
        if (key in propsDefaults) {
          value = propsDefaults[key];
        } else {
          const reset = setCurrentInstance(instance);
          value = propsDefaults[key] = defaultValue.call(
            null,
            props
          );
          reset();
        }
      } else {
        value = defaultValue;
      }
      if (instance.ce) {
        instance.ce._setProp(key, value);
      }
    }
    if (opt[
      0
      /* shouldCast */
    ]) {
      if (isAbsent && !hasDefault) {
        value = false;
      } else if (opt[
        1
        /* shouldCastTrue */
      ] && (value === "" || value === hyphenate(key))) {
        value = true;
      }
    }
  }
  return value;
}
const mixinPropsCache = /* @__PURE__ */ new WeakMap();
function normalizePropsOptions(comp, appContext, asMixin = false) {
  const cache = asMixin ? mixinPropsCache : appContext.propsCache;
  const cached = cache.get(comp);
  if (cached) {
    return cached;
  }
  const raw = comp.props;
  const normalized = {};
  const needCastKeys = [];
  let hasExtends = false;
  if (!isFunction(comp)) {
    const extendProps = (raw2) => {
      hasExtends = true;
      const [props, keys] = normalizePropsOptions(raw2, appContext, true);
      extend(normalized, props);
      if (keys) needCastKeys.push(...keys);
    };
    if (!asMixin && appContext.mixins.length) {
      appContext.mixins.forEach(extendProps);
    }
    if (comp.extends) {
      extendProps(comp.extends);
    }
    if (comp.mixins) {
      comp.mixins.forEach(extendProps);
    }
  }
  if (!raw && !hasExtends) {
    if (isObject$2(comp)) {
      cache.set(comp, EMPTY_ARR);
    }
    return EMPTY_ARR;
  }
  if (isArray(raw)) {
    for (let i = 0; i < raw.length; i++) {
      const normalizedKey = camelize(raw[i]);
      if (validatePropName(normalizedKey)) {
        normalized[normalizedKey] = EMPTY_OBJ;
      }
    }
  } else if (raw) {
    for (const key in raw) {
      const normalizedKey = camelize(key);
      if (validatePropName(normalizedKey)) {
        const opt = raw[key];
        const prop = normalized[normalizedKey] = isArray(opt) || isFunction(opt) ? { type: opt } : extend({}, opt);
        const propType = prop.type;
        let shouldCast = false;
        let shouldCastTrue = true;
        if (isArray(propType)) {
          for (let index = 0; index < propType.length; ++index) {
            const type = propType[index];
            const typeName = isFunction(type) && type.name;
            if (typeName === "Boolean") {
              shouldCast = true;
              break;
            } else if (typeName === "String") {
              shouldCastTrue = false;
            }
          }
        } else {
          shouldCast = isFunction(propType) && propType.name === "Boolean";
        }
        prop[
          0
          /* shouldCast */
        ] = shouldCast;
        prop[
          1
          /* shouldCastTrue */
        ] = shouldCastTrue;
        if (shouldCast || hasOwn(prop, "default")) {
          needCastKeys.push(normalizedKey);
        }
      }
    }
  }
  const res = [normalized, needCastKeys];
  if (isObject$2(comp)) {
    cache.set(comp, res);
  }
  return res;
}
function validatePropName(key) {
  if (key[0] !== "$" && !isReservedProp(key)) {
    return true;
  }
  return false;
}
const isInternalKey = (key) => key === "_" || key === "_ctx" || key === "$stable";
const normalizeSlotValue = (value) => isArray(value) ? value.map(normalizeVNode) : [normalizeVNode(value)];
const normalizeSlot = (key, rawSlot, ctx) => {
  if (rawSlot._n) {
    return rawSlot;
  }
  const normalized = withCtx((...args) => {
    if (false) ;
    return normalizeSlotValue(rawSlot(...args));
  }, ctx);
  normalized._c = false;
  return normalized;
};
const normalizeObjectSlots = (rawSlots, slots, instance) => {
  const ctx = rawSlots._ctx;
  for (const key in rawSlots) {
    if (isInternalKey(key)) continue;
    const value = rawSlots[key];
    if (isFunction(value)) {
      slots[key] = normalizeSlot(key, value, ctx);
    } else if (value != null) {
      const normalized = normalizeSlotValue(value);
      slots[key] = () => normalized;
    }
  }
};
const normalizeVNodeSlots = (instance, children) => {
  const normalized = normalizeSlotValue(children);
  instance.slots.default = () => normalized;
};
const assignSlots = (slots, children, optimized) => {
  for (const key in children) {
    if (optimized || !isInternalKey(key)) {
      slots[key] = children[key];
    }
  }
};
const initSlots = (instance, children, optimized) => {
  const slots = instance.slots = createInternalObject();
  if (instance.vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      assignSlots(slots, children, optimized);
      if (optimized) {
        def(slots, "_", type, true);
      }
    } else {
      normalizeObjectSlots(children, slots);
    }
  } else if (children) {
    normalizeVNodeSlots(instance, children);
  }
};
const updateSlots = (instance, children, optimized) => {
  const { vnode, slots } = instance;
  let needDeletionCheck = true;
  let deletionComparisonTarget = EMPTY_OBJ;
  if (vnode.shapeFlag & 32) {
    const type = children._;
    if (type) {
      if (optimized && type === 1) {
        needDeletionCheck = false;
      } else {
        assignSlots(slots, children, optimized);
      }
    } else {
      needDeletionCheck = !children.$stable;
      normalizeObjectSlots(children, slots);
    }
    deletionComparisonTarget = children;
  } else if (children) {
    normalizeVNodeSlots(instance, children);
    deletionComparisonTarget = { default: 1 };
  }
  if (needDeletionCheck) {
    for (const key in slots) {
      if (!isInternalKey(key) && deletionComparisonTarget[key] == null) {
        delete slots[key];
      }
    }
  }
};
const queuePostRenderEffect = queueEffectWithSuspense;
function createRenderer(options) {
  return baseCreateRenderer(options);
}
function createHydrationRenderer(options) {
  return baseCreateRenderer(options, createHydrationFunctions);
}
function baseCreateRenderer(options, createHydrationFns) {
  const target = getGlobalThis();
  target.__VUE__ = true;
  const {
    insert: hostInsert,
    remove: hostRemove,
    patchProp: hostPatchProp,
    createElement: hostCreateElement,
    createText: hostCreateText,
    createComment: hostCreateComment,
    setText: hostSetText,
    setElementText: hostSetElementText,
    parentNode: hostParentNode,
    nextSibling: hostNextSibling,
    setScopeId: hostSetScopeId = NOOP,
    insertStaticContent: hostInsertStaticContent
  } = options;
  const patch = (n1, n2, container, anchor = null, parentComponent = null, parentSuspense = null, namespace = void 0, slotScopeIds = null, optimized = !!n2.dynamicChildren) => {
    if (n1 === n2) {
      return;
    }
    if (n1 && !isSameVNodeType(n1, n2)) {
      anchor = getNextHostNode(n1);
      unmount(n1, parentComponent, parentSuspense, true);
      n1 = null;
    }
    if (n2.patchFlag === -2) {
      optimized = false;
      n2.dynamicChildren = null;
    }
    const { type, ref: ref3, shapeFlag } = n2;
    switch (type) {
      case Text:
        processText(n1, n2, container, anchor);
        break;
      case Comment:
        processCommentNode(n1, n2, container, anchor);
        break;
      case Static:
        if (n1 == null) {
          mountStaticNode(n2, container, anchor, namespace);
        }
        break;
      case Fragment:
        processFragment(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        break;
      default:
        if (shapeFlag & 1) {
          processElement(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 6) {
          processComponent(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (shapeFlag & 64) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else if (shapeFlag & 128) {
          type.process(
            n1,
            n2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized,
            internals
          );
        } else ;
    }
    if (ref3 != null && parentComponent) {
      setRef(ref3, n1 && n1.ref, parentSuspense, n2 || n1, !n2);
    } else if (ref3 == null && n1 && n1.ref != null) {
      setRef(n1.ref, null, parentSuspense, n1, true);
    }
  };
  const processText = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateText(n2.children),
        container,
        anchor
      );
    } else {
      const el = n2.el = n1.el;
      if (n2.children !== n1.children) {
        hostSetText(el, n2.children);
      }
    }
  };
  const processCommentNode = (n1, n2, container, anchor) => {
    if (n1 == null) {
      hostInsert(
        n2.el = hostCreateComment(n2.children || ""),
        container,
        anchor
      );
    } else {
      n2.el = n1.el;
    }
  };
  const mountStaticNode = (n2, container, anchor, namespace) => {
    [n2.el, n2.anchor] = hostInsertStaticContent(
      n2.children,
      container,
      anchor,
      namespace,
      n2.el,
      n2.anchor
    );
  };
  const moveStaticNode = ({ el, anchor }, container, nextSibling) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostInsert(el, container, nextSibling);
      el = next;
    }
    hostInsert(anchor, container, nextSibling);
  };
  const removeStaticNode = ({ el, anchor }) => {
    let next;
    while (el && el !== anchor) {
      next = hostNextSibling(el);
      hostRemove(el);
      el = next;
    }
    hostRemove(anchor);
  };
  const processElement = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    if (n2.type === "svg") {
      namespace = "svg";
    } else if (n2.type === "math") {
      namespace = "mathml";
    }
    if (n1 == null) {
      mountElement(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      const customElement = n1.el && n1.el._isVueCE ? n1.el : null;
      try {
        if (customElement) {
          customElement._beginPatch();
        }
        patchElement(
          n1,
          n2,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } finally {
        if (customElement) {
          customElement._endPatch();
        }
      }
    }
  };
  const mountElement = (vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let el;
    let vnodeHook;
    const { props, shapeFlag, transition, dirs } = vnode;
    el = vnode.el = hostCreateElement(
      vnode.type,
      namespace,
      props && props.is,
      props
    );
    if (shapeFlag & 8) {
      hostSetElementText(el, vnode.children);
    } else if (shapeFlag & 16) {
      mountChildren(
        vnode.children,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(vnode, namespace),
        slotScopeIds,
        optimized
      );
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "created");
    }
    setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent);
    if (props) {
      for (const key in props) {
        if (key !== "value" && !isReservedProp(key)) {
          hostPatchProp(el, key, null, props[key], namespace, parentComponent);
        }
      }
      if ("value" in props) {
        hostPatchProp(el, "value", null, props.value, namespace);
      }
      if (vnodeHook = props.onVnodeBeforeMount) {
        invokeVNodeHook(vnodeHook, parentComponent, vnode);
      }
    }
    if (dirs) {
      invokeDirectiveHook(vnode, null, parentComponent, "beforeMount");
    }
    const needCallTransitionHooks = needTransition(parentSuspense, transition);
    if (needCallTransitionHooks) {
      transition.beforeEnter(el);
    }
    hostInsert(el, container, anchor);
    if ((vnodeHook = props && props.onVnodeMounted) || needCallTransitionHooks || dirs) {
      queuePostRenderEffect(() => {
        try {
          vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
          needCallTransitionHooks && transition.enter(el);
          dirs && invokeDirectiveHook(vnode, null, parentComponent, "mounted");
        } finally {
        }
      }, parentSuspense);
    }
  };
  const setScopeId = (el, vnode, scopeId, slotScopeIds, parentComponent) => {
    if (scopeId) {
      hostSetScopeId(el, scopeId);
    }
    if (slotScopeIds) {
      for (let i = 0; i < slotScopeIds.length; i++) {
        hostSetScopeId(el, slotScopeIds[i]);
      }
    }
    if (parentComponent) {
      let subTree = parentComponent.subTree;
      if (vnode === subTree || isSuspense(subTree.type) && (subTree.ssContent === vnode || subTree.ssFallback === vnode)) {
        const parentVNode = parentComponent.vnode;
        setScopeId(
          el,
          parentVNode,
          parentVNode.scopeId,
          parentVNode.slotScopeIds,
          parentComponent.parent
        );
      }
    }
  };
  const mountChildren = (children, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, start = 0) => {
    for (let i = start; i < children.length; i++) {
      const child = children[i] = optimized ? cloneIfMounted(children[i]) : normalizeVNode(children[i]);
      patch(
        null,
        child,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
  };
  const patchElement = (n1, n2, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const el = n2.el = n1.el;
    let { patchFlag, dynamicChildren, dirs } = n2;
    patchFlag |= n1.patchFlag & 16;
    const oldProps = n1.props || EMPTY_OBJ;
    const newProps = n2.props || EMPTY_OBJ;
    let vnodeHook;
    parentComponent && toggleRecurse(parentComponent, false);
    if (vnodeHook = newProps.onVnodeBeforeUpdate) {
      invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
    }
    if (dirs) {
      invokeDirectiveHook(n2, n1, parentComponent, "beforeUpdate");
    }
    parentComponent && toggleRecurse(parentComponent, true);
    if (
      // #6385 the old vnode may be a user-wrapped non-isomorphic block
      // Force full diff when block metadata is unstable.
      dynamicChildren && (!n1.dynamicChildren || n1.dynamicChildren.length !== dynamicChildren.length)
    ) {
      patchFlag = 0;
      optimized = false;
      dynamicChildren = null;
    }
    if (oldProps.innerHTML && newProps.innerHTML == null || oldProps.textContent && newProps.textContent == null) {
      hostSetElementText(el, "");
    }
    if (dynamicChildren) {
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        el,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds
      );
    } else if (!optimized) {
      patchChildren(
        n1,
        n2,
        el,
        null,
        parentComponent,
        parentSuspense,
        resolveChildrenNamespace(n2, namespace),
        slotScopeIds,
        false
      );
    }
    if (patchFlag > 0) {
      if (patchFlag & 16) {
        patchProps(el, oldProps, newProps, parentComponent, namespace);
      } else {
        if (patchFlag & 2) {
          if (oldProps.class !== newProps.class) {
            hostPatchProp(el, "class", null, newProps.class, namespace);
          }
        }
        if (patchFlag & 4) {
          hostPatchProp(el, "style", oldProps.style, newProps.style, namespace);
        }
        if (patchFlag & 8) {
          const propsToUpdate = n2.dynamicProps;
          for (let i = 0; i < propsToUpdate.length; i++) {
            const key = propsToUpdate[i];
            const prev = oldProps[key];
            const next = newProps[key];
            if (next !== prev || key === "value") {
              hostPatchProp(el, key, prev, next, namespace, parentComponent);
            }
          }
        }
      }
      if (patchFlag & 1) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children);
        }
      }
    } else if (!optimized && dynamicChildren == null) {
      patchProps(el, oldProps, newProps, parentComponent, namespace);
    }
    if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1);
        dirs && invokeDirectiveHook(n2, n1, parentComponent, "updated");
      }, parentSuspense);
    }
  };
  const patchBlockChildren = (oldChildren, newChildren, fallbackContainer, parentComponent, parentSuspense, namespace, slotScopeIds) => {
    for (let i = 0; i < newChildren.length; i++) {
      const oldVNode = oldChildren[i];
      const newVNode = newChildren[i];
      const container = (
        // oldVNode may be an errored async setup() component inside Suspense
        // which will not have a mounted element
        oldVNode.el && // - In the case of a Fragment, we need to provide the actual parent
        // of the Fragment itself so it can move its children.
        (oldVNode.type === Fragment || // - In the case of different nodes, there is going to be a replacement
        // which also requires the correct parent container
        !isSameVNodeType(oldVNode, newVNode) || // - In the case of a component, it could contain anything.
        oldVNode.shapeFlag & (6 | 64 | 128)) ? hostParentNode(oldVNode.el) : (
          // In other cases, the parent container is not actually used so we
          // just pass the block element here to avoid a DOM parentNode call.
          fallbackContainer
        )
      );
      patch(
        oldVNode,
        newVNode,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        true
      );
    }
  };
  const patchProps = (el, oldProps, newProps, parentComponent, namespace) => {
    if (oldProps !== newProps) {
      if (oldProps !== EMPTY_OBJ) {
        for (const key in oldProps) {
          if (!isReservedProp(key) && !(key in newProps)) {
            hostPatchProp(
              el,
              key,
              oldProps[key],
              null,
              namespace,
              parentComponent
            );
          }
        }
      }
      for (const key in newProps) {
        if (isReservedProp(key)) continue;
        const next = newProps[key];
        const prev = oldProps[key];
        if (next !== prev && key !== "value") {
          hostPatchProp(el, key, prev, next, namespace, parentComponent);
        }
      }
      if ("value" in newProps) {
        hostPatchProp(el, "value", oldProps.value, newProps.value, namespace);
      }
    }
  };
  const processFragment = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    const fragmentStartAnchor = n2.el = n1 ? n1.el : hostCreateText("");
    const fragmentEndAnchor = n2.anchor = n1 ? n1.anchor : hostCreateText("");
    let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2;
    if (fragmentSlotScopeIds) {
      slotScopeIds = slotScopeIds ? slotScopeIds.concat(fragmentSlotScopeIds) : fragmentSlotScopeIds;
    }
    if (n1 == null) {
      hostInsert(fragmentStartAnchor, container, anchor);
      hostInsert(fragmentEndAnchor, container, anchor);
      mountChildren(
        // #10007
        // such fragment like `<></>` will be compiled into
        // a fragment which doesn't have a children.
        // In this case fallback to an empty array
        n2.children || [],
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    } else {
      if (patchFlag > 0 && patchFlag & 64 && dynamicChildren && // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren && n1.dynamicChildren.length === dynamicChildren.length) {
        patchBlockChildren(
          n1.dynamicChildren,
          dynamicChildren,
          container,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds
        );
        if (
          // #2080 if the stable fragment has a key, it's a <template v-for> that may
          //  get moved around. Make sure all root level vnodes inherit el.
          // #2134 or if it's a component root, it may also get moved around
          // as the component is being moved.
          n2.key != null || parentComponent && n2 === parentComponent.subTree
        ) {
          traverseStaticChildren(
            n1,
            n2,
            true
            /* shallow */
          );
        }
      } else {
        patchChildren(
          n1,
          n2,
          container,
          fragmentEndAnchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      }
    }
  };
  const processComponent = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    n2.slotScopeIds = slotScopeIds;
    if (n1 == null) {
      if (n2.shapeFlag & 512) {
        parentComponent.ctx.activate(
          n2,
          container,
          anchor,
          namespace,
          optimized
        );
      } else {
        mountComponent(
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          optimized
        );
      }
    } else {
      updateComponent(n1, n2, optimized);
    }
  };
  const mountComponent = (initialVNode, container, anchor, parentComponent, parentSuspense, namespace, optimized) => {
    const instance = initialVNode.component = createComponentInstance(
      initialVNode,
      parentComponent,
      parentSuspense
    );
    if (isKeepAlive(initialVNode)) {
      instance.ctx.renderer = internals;
    }
    {
      setupComponent(instance, false, optimized);
    }
    if (instance.asyncDep) {
      parentSuspense && parentSuspense.registerDep(instance, setupRenderEffect, optimized);
      if (!initialVNode.el) {
        const placeholder = instance.subTree = createVNode(Comment);
        processCommentNode(null, placeholder, container, anchor);
        initialVNode.placeholder = placeholder.el;
      }
    } else {
      setupRenderEffect(
        instance,
        initialVNode,
        container,
        anchor,
        parentSuspense,
        namespace,
        optimized
      );
    }
  };
  const updateComponent = (n1, n2, optimized) => {
    const instance = n2.component = n1.component;
    if (shouldUpdateComponent(n1, n2, optimized)) {
      if (instance.asyncDep && !instance.asyncResolved) {
        updateComponentPreRender(instance, n2, optimized);
        return;
      } else {
        instance.next = n2;
        instance.update();
      }
    } else {
      n2.el = n1.el;
      instance.vnode = n2;
    }
  };
  const setupRenderEffect = (instance, initialVNode, container, anchor, parentSuspense, namespace, optimized) => {
    const componentUpdateFn = () => {
      if (!instance.isMounted) {
        let vnodeHook;
        const { el, props } = initialVNode;
        const { bm, m, parent, root, type } = instance;
        const isAsyncWrapperVNode = isAsyncWrapper(initialVNode);
        toggleRecurse(instance, false);
        if (bm) {
          invokeArrayFns(bm);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeBeforeMount)) {
          invokeVNodeHook(vnodeHook, parent, initialVNode);
        }
        toggleRecurse(instance, true);
        if (el && hydrateNode) {
          const hydrateSubTree = () => {
            instance.subTree = renderComponentRoot(instance);
            hydrateNode(
              el,
              instance.subTree,
              instance,
              parentSuspense,
              null
            );
          };
          if (isAsyncWrapperVNode && type.__asyncHydrate) {
            type.__asyncHydrate(
              el,
              instance,
              hydrateSubTree
            );
          } else {
            hydrateSubTree();
          }
        } else {
          if (root.ce && root.ce._hasShadowRoot()) {
            root.ce._injectChildStyle(
              type,
              instance.parent ? instance.parent.type : void 0
            );
          }
          const subTree = instance.subTree = renderComponentRoot(instance);
          patch(
            null,
            subTree,
            container,
            anchor,
            instance,
            parentSuspense,
            namespace
          );
          initialVNode.el = subTree.el;
        }
        if (m) {
          queuePostRenderEffect(m, parentSuspense);
        }
        if (!isAsyncWrapperVNode && (vnodeHook = props && props.onVnodeMounted)) {
          const scopedInitialVNode = initialVNode;
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, scopedInitialVNode),
            parentSuspense
          );
        }
        if (initialVNode.shapeFlag & 256 || parent && isAsyncWrapper(parent.vnode) && parent.vnode.shapeFlag & 256) {
          instance.a && queuePostRenderEffect(instance.a, parentSuspense);
        }
        instance.isMounted = true;
        initialVNode = container = anchor = null;
      } else {
        let { next, bu, u, parent, vnode } = instance;
        {
          const nonHydratedAsyncRoot = locateNonHydratedAsyncRoot(instance);
          if (nonHydratedAsyncRoot) {
            if (next) {
              next.el = vnode.el;
              updateComponentPreRender(instance, next, optimized);
            }
            nonHydratedAsyncRoot.asyncDep.then(() => {
              queuePostRenderEffect(() => {
                if (!instance.isUnmounted) update();
              }, parentSuspense);
            });
            return;
          }
        }
        let originNext = next;
        let vnodeHook;
        toggleRecurse(instance, false);
        if (next) {
          next.el = vnode.el;
          updateComponentPreRender(instance, next, optimized);
        } else {
          next = vnode;
        }
        if (bu) {
          invokeArrayFns(bu);
        }
        if (vnodeHook = next.props && next.props.onVnodeBeforeUpdate) {
          invokeVNodeHook(vnodeHook, parent, next, vnode);
        }
        toggleRecurse(instance, true);
        const nextTree = renderComponentRoot(instance);
        const prevTree = instance.subTree;
        instance.subTree = nextTree;
        patch(
          prevTree,
          nextTree,
          // parent may have changed if it's in a teleport
          hostParentNode(prevTree.el),
          // anchor may have changed if it's in a fragment
          getNextHostNode(prevTree),
          instance,
          parentSuspense,
          namespace
        );
        next.el = nextTree.el;
        if (originNext === null) {
          updateHOCHostEl(instance, nextTree.el);
        }
        if (u) {
          queuePostRenderEffect(u, parentSuspense);
        }
        if (vnodeHook = next.props && next.props.onVnodeUpdated) {
          queuePostRenderEffect(
            () => invokeVNodeHook(vnodeHook, parent, next, vnode),
            parentSuspense
          );
        }
      }
    };
    instance.scope.on();
    const effect2 = instance.effect = new ReactiveEffect(componentUpdateFn);
    instance.scope.off();
    const update = instance.update = effect2.run.bind(effect2);
    const job = instance.job = effect2.runIfDirty.bind(effect2);
    job.i = instance;
    job.id = instance.uid;
    effect2.scheduler = () => queueJob(job);
    toggleRecurse(instance, true);
    update();
  };
  const updateComponentPreRender = (instance, nextVNode, optimized) => {
    nextVNode.component = instance;
    const prevProps = instance.vnode.props;
    instance.vnode = nextVNode;
    instance.next = null;
    updateProps(instance, nextVNode.props, prevProps, optimized);
    updateSlots(instance, nextVNode.children, optimized);
    pauseTracking();
    flushPreFlushCbs(instance);
    resetTracking();
  };
  const patchChildren = (n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized = false) => {
    const c1 = n1 && n1.children;
    const prevShapeFlag = n1 ? n1.shapeFlag : 0;
    const c2 = n2.children;
    const { patchFlag, shapeFlag } = n2;
    if (patchFlag > 0) {
      if (patchFlag & 128) {
        patchKeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      } else if (patchFlag & 256) {
        patchUnkeyedChildren(
          c1,
          c2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
        return;
      }
    }
    if (shapeFlag & 8) {
      if (prevShapeFlag & 16) {
        unmountChildren(c1, parentComponent, parentSuspense);
      }
      if (c2 !== c1) {
        hostSetElementText(container, c2);
      }
    } else {
      if (prevShapeFlag & 16) {
        if (shapeFlag & 16) {
          patchKeyedChildren(
            c1,
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else {
          unmountChildren(c1, parentComponent, parentSuspense, true);
        }
      } else {
        if (prevShapeFlag & 8) {
          hostSetElementText(container, "");
        }
        if (shapeFlag & 16) {
          mountChildren(
            c2,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        }
      }
    }
  };
  const patchUnkeyedChildren = (c1, c2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    c1 = c1 || EMPTY_ARR;
    c2 = c2 || EMPTY_ARR;
    const oldLength = c1.length;
    const newLength = c2.length;
    const commonLength = Math.min(oldLength, newLength);
    let i;
    for (i = 0; i < commonLength; i++) {
      const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      patch(
        c1[i],
        nextChild,
        container,
        null,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized
      );
    }
    if (oldLength > newLength) {
      unmountChildren(
        c1,
        parentComponent,
        parentSuspense,
        true,
        false,
        commonLength
      );
    } else {
      mountChildren(
        c2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        commonLength
      );
    }
  };
  const patchKeyedChildren = (c1, c2, container, parentAnchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized) => {
    let i = 0;
    const l2 = c2.length;
    let e1 = c1.length - 1;
    let e2 = l2 - 1;
    while (i <= e1 && i <= e2) {
      const n1 = c1[i];
      const n2 = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      i++;
    }
    while (i <= e1 && i <= e2) {
      const n1 = c1[e1];
      const n2 = c2[e2] = optimized ? cloneIfMounted(c2[e2]) : normalizeVNode(c2[e2]);
      if (isSameVNodeType(n1, n2)) {
        patch(
          n1,
          n2,
          container,
          null,
          parentComponent,
          parentSuspense,
          namespace,
          slotScopeIds,
          optimized
        );
      } else {
        break;
      }
      e1--;
      e2--;
    }
    if (i > e1) {
      if (i <= e2) {
        const nextPos = e2 + 1;
        const anchor = nextPos < l2 ? c2[nextPos].el : parentAnchor;
        while (i <= e2) {
          patch(
            null,
            c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]),
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          i++;
        }
      }
    } else if (i > e2) {
      while (i <= e1) {
        unmount(c1[i], parentComponent, parentSuspense, true);
        i++;
      }
    } else {
      const s1 = i;
      const s2 = i;
      const keyToNewIndexMap = /* @__PURE__ */ new Map();
      for (i = s2; i <= e2; i++) {
        const nextChild = c2[i] = optimized ? cloneIfMounted(c2[i]) : normalizeVNode(c2[i]);
        if (nextChild.key != null) {
          keyToNewIndexMap.set(nextChild.key, i);
        }
      }
      let j;
      let patched = 0;
      const toBePatched = e2 - s2 + 1;
      let moved = false;
      let maxNewIndexSoFar = 0;
      const newIndexToOldIndexMap = new Array(toBePatched);
      for (i = 0; i < toBePatched; i++) newIndexToOldIndexMap[i] = 0;
      for (i = s1; i <= e1; i++) {
        const prevChild = c1[i];
        if (patched >= toBePatched) {
          unmount(prevChild, parentComponent, parentSuspense, true);
          continue;
        }
        let newIndex;
        if (prevChild.key != null) {
          newIndex = keyToNewIndexMap.get(prevChild.key);
        } else {
          for (j = s2; j <= e2; j++) {
            if (newIndexToOldIndexMap[j - s2] === 0 && isSameVNodeType(prevChild, c2[j])) {
              newIndex = j;
              break;
            }
          }
        }
        if (newIndex === void 0) {
          unmount(prevChild, parentComponent, parentSuspense, true);
        } else {
          newIndexToOldIndexMap[newIndex - s2] = i + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
          patch(
            prevChild,
            c2[newIndex],
            container,
            null,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
          patched++;
        }
      }
      const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : EMPTY_ARR;
      j = increasingNewIndexSequence.length - 1;
      for (i = toBePatched - 1; i >= 0; i--) {
        const nextIndex = s2 + i;
        const nextChild = c2[nextIndex];
        const anchorVNode = c2[nextIndex + 1];
        const anchor = nextIndex + 1 < l2 ? (
          // #13559, #14173 fallback to el placeholder for unresolved async component
          anchorVNode.el || resolveAsyncComponentPlaceholder(anchorVNode)
        ) : parentAnchor;
        if (newIndexToOldIndexMap[i] === 0) {
          patch(
            null,
            nextChild,
            container,
            anchor,
            parentComponent,
            parentSuspense,
            namespace,
            slotScopeIds,
            optimized
          );
        } else if (moved) {
          if (j < 0 || i !== increasingNewIndexSequence[j]) {
            move(nextChild, container, anchor, 2);
          } else {
            j--;
          }
        }
      }
    }
  };
  const move = (vnode, container, anchor, moveType, parentSuspense = null) => {
    const { el, type, transition, children, shapeFlag } = vnode;
    if (shapeFlag & 6) {
      move(vnode.component.subTree, container, anchor, moveType);
      return;
    }
    if (shapeFlag & 128) {
      vnode.suspense.move(container, anchor, moveType);
      return;
    }
    if (shapeFlag & 64) {
      type.move(vnode, container, anchor, internals);
      return;
    }
    if (type === Fragment) {
      hostInsert(el, container, anchor);
      for (let i = 0; i < children.length; i++) {
        move(children[i], container, anchor, moveType);
      }
      hostInsert(vnode.anchor, container, anchor);
      return;
    }
    if (type === Static) {
      moveStaticNode(vnode, container, anchor);
      return;
    }
    const needTransition2 = moveType !== 2 && shapeFlag & 1 && transition;
    if (needTransition2) {
      if (moveType === 0) {
        if (transition.persisted && !el[leaveCbKey]) {
          hostInsert(el, container, anchor);
        } else {
          transition.beforeEnter(el);
          hostInsert(el, container, anchor);
          queuePostRenderEffect(() => transition.enter(el), parentSuspense);
        }
      } else {
        const { leave, delayLeave, afterLeave } = transition;
        const remove22 = () => {
          if (vnode.ctx.isUnmounted) {
            hostRemove(el);
          } else {
            hostInsert(el, container, anchor);
          }
        };
        const performLeave = () => {
          const wasLeaving = el._isLeaving || !!el[leaveCbKey];
          if (el._isLeaving) {
            el[leaveCbKey](
              true
              /* cancelled */
            );
          }
          if (transition.persisted && !wasLeaving) {
            remove22();
          } else {
            leave(el, () => {
              remove22();
              afterLeave && afterLeave();
            });
          }
        };
        if (delayLeave) {
          delayLeave(el, remove22, performLeave);
        } else {
          performLeave();
        }
      }
    } else {
      hostInsert(el, container, anchor);
    }
  };
  const unmount = (vnode, parentComponent, parentSuspense, doRemove = false, optimized = false) => {
    const {
      type,
      props,
      ref: ref3,
      children,
      dynamicChildren,
      shapeFlag,
      patchFlag,
      dirs,
      cacheIndex,
      memo
    } = vnode;
    if (patchFlag === -2) {
      optimized = false;
    }
    if (ref3 != null) {
      pauseTracking();
      setRef(ref3, null, parentSuspense, vnode, true);
      resetTracking();
    }
    if (cacheIndex != null) {
      parentComponent.renderCache[cacheIndex] = void 0;
    }
    if (shapeFlag & 256) {
      parentComponent.ctx.deactivate(vnode);
      return;
    }
    const shouldInvokeDirs = shapeFlag & 1 && dirs;
    const shouldInvokeVnodeHook = !isAsyncWrapper(vnode);
    let vnodeHook;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeBeforeUnmount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode);
    }
    if (shapeFlag & 6) {
      unmountComponent(vnode.component, parentSuspense, doRemove);
    } else {
      if (shapeFlag & 128) {
        vnode.suspense.unmount(parentSuspense, doRemove);
        return;
      }
      if (shouldInvokeDirs) {
        invokeDirectiveHook(vnode, null, parentComponent, "beforeUnmount");
      }
      if (shapeFlag & 64) {
        vnode.type.remove(
          vnode,
          parentComponent,
          parentSuspense,
          internals,
          doRemove
        );
      } else if (dynamicChildren && // #5154
      // when v-once is used inside a block, setBlockTracking(-1) marks the
      // parent block with hasOnce: true
      // so that it doesn't take the fast path during unmount - otherwise
      // components nested in v-once are never unmounted.
      !dynamicChildren.hasOnce && // #1153: fast path should not be taken for non-stable (v-for) fragments
      (type !== Fragment || patchFlag > 0 && patchFlag & 64)) {
        unmountChildren(
          dynamicChildren,
          parentComponent,
          parentSuspense,
          false,
          true
        );
      } else if (type === Fragment && patchFlag & (128 | 256) || !optimized && shapeFlag & 16) {
        unmountChildren(children, parentComponent, parentSuspense);
      }
      if (doRemove) {
        remove2(vnode);
      }
    }
    const shouldInvalidateMemo = memo != null && cacheIndex == null;
    if (shouldInvokeVnodeHook && (vnodeHook = props && props.onVnodeUnmounted) || shouldInvokeDirs || shouldInvalidateMemo) {
      queuePostRenderEffect(() => {
        vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode);
        shouldInvokeDirs && invokeDirectiveHook(vnode, null, parentComponent, "unmounted");
        if (shouldInvalidateMemo) {
          vnode.el = null;
        }
      }, parentSuspense);
    }
  };
  const remove2 = (vnode) => {
    const { type, el, anchor, transition } = vnode;
    if (type === Fragment) {
      {
        removeFragment(el, anchor);
      }
      return;
    }
    if (type === Static) {
      removeStaticNode(vnode);
      return;
    }
    const performRemove = () => {
      hostRemove(el);
      if (transition && !transition.persisted && transition.afterLeave) {
        transition.afterLeave();
      }
    };
    if (vnode.shapeFlag & 1 && transition && !transition.persisted) {
      const { leave, delayLeave } = transition;
      const performLeave = () => leave(el, performRemove);
      if (delayLeave) {
        delayLeave(vnode.el, performRemove, performLeave);
      } else {
        performLeave();
      }
    } else {
      performRemove();
    }
  };
  const removeFragment = (cur, end) => {
    let next;
    while (cur !== end) {
      next = hostNextSibling(cur);
      hostRemove(cur);
      cur = next;
    }
    hostRemove(end);
  };
  const unmountComponent = (instance, parentSuspense, doRemove) => {
    const { bum, scope, job, subTree, um, m, a } = instance;
    invalidateMount(m);
    invalidateMount(a);
    if (bum) {
      invokeArrayFns(bum);
    }
    scope.stop();
    if (job) {
      job.flags |= 8;
      unmount(subTree, instance, parentSuspense, doRemove);
    }
    if (um) {
      queuePostRenderEffect(um, parentSuspense);
    }
    queuePostRenderEffect(() => {
      instance.isUnmounted = true;
    }, parentSuspense);
  };
  const unmountChildren = (children, parentComponent, parentSuspense, doRemove = false, optimized = false, start = 0) => {
    for (let i = start; i < children.length; i++) {
      unmount(children[i], parentComponent, parentSuspense, doRemove, optimized);
    }
  };
  const getNextHostNode = (vnode) => {
    if (vnode.shapeFlag & 6) {
      return getNextHostNode(vnode.component.subTree);
    }
    if (vnode.shapeFlag & 128) {
      return vnode.suspense.next();
    }
    const el = hostNextSibling(vnode.anchor || vnode.el);
    const teleportEnd = el && el[TeleportEndKey];
    return teleportEnd ? hostNextSibling(teleportEnd) : el;
  };
  let isFlushing = false;
  const render2 = (vnode, container, namespace) => {
    let instance;
    if (vnode == null) {
      if (container._vnode) {
        unmount(container._vnode, null, null, true);
        instance = container._vnode.component;
      }
    } else {
      patch(
        container._vnode || null,
        vnode,
        container,
        null,
        null,
        null,
        namespace
      );
    }
    container._vnode = vnode;
    if (!isFlushing) {
      isFlushing = true;
      flushPreFlushCbs(instance);
      flushPostFlushCbs();
      isFlushing = false;
    }
  };
  const internals = {
    p: patch,
    um: unmount,
    m: move,
    r: remove2,
    mt: mountComponent,
    mc: mountChildren,
    pc: patchChildren,
    pbc: patchBlockChildren,
    n: getNextHostNode,
    o: options
  };
  let hydrate2;
  let hydrateNode;
  if (createHydrationFns) {
    [hydrate2, hydrateNode] = createHydrationFns(
      internals
    );
  }
  return {
    render: render2,
    hydrate: hydrate2,
    createApp: createAppAPI(render2, hydrate2)
  };
}
function resolveChildrenNamespace({ type, props }, currentNamespace) {
  return currentNamespace === "svg" && type === "foreignObject" || currentNamespace === "mathml" && type === "annotation-xml" && props && props.encoding && props.encoding.includes("html") ? void 0 : currentNamespace;
}
function toggleRecurse({ effect: effect2, job }, allowed) {
  if (allowed) {
    effect2.flags |= 32;
    job.flags |= 4;
  } else {
    effect2.flags &= -33;
    job.flags &= -5;
  }
}
function needTransition(parentSuspense, transition) {
  return (!parentSuspense || parentSuspense && !parentSuspense.pendingBranch) && transition && !transition.persisted;
}
function traverseStaticChildren(n1, n2, shallow = false) {
  const ch1 = n1.children;
  const ch2 = n2.children;
  if (isArray(ch1) && isArray(ch2)) {
    for (let i = 0; i < ch1.length; i++) {
      const c1 = ch1[i];
      let c2 = ch2[i];
      if (c2.shapeFlag & 1 && !c2.dynamicChildren) {
        if (c2.patchFlag <= 0 || c2.patchFlag === 32) {
          c2 = ch2[i] = cloneIfMounted(ch2[i]);
          c2.el = c1.el;
        }
        if (!shallow && c2.patchFlag !== -2)
          traverseStaticChildren(c1, c2);
      }
      if (c2.type === Text) {
        if (c2.patchFlag === -1) {
          c2 = ch2[i] = cloneIfMounted(c2);
        }
        c2.el = c1.el;
      }
      if (c2.type === Comment && !c2.el) {
        c2.el = c1.el;
      }
    }
  }
}
function getSequence(arr) {
  const p2 = arr.slice();
  const result = [0];
  let i, j, u, v, c;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p2[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = u + v >> 1;
        if (arr[result[c]] < arrI) {
          u = c + 1;
        } else {
          v = c;
        }
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) {
          p2[i] = result[u - 1];
        }
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p2[v];
  }
  return result;
}
function locateNonHydratedAsyncRoot(instance) {
  const subComponent = instance.subTree.component;
  if (subComponent) {
    if (subComponent.asyncDep && !subComponent.asyncResolved) {
      return subComponent;
    } else {
      return locateNonHydratedAsyncRoot(subComponent);
    }
  }
}
function invalidateMount(hooks) {
  if (hooks) {
    for (let i = 0; i < hooks.length; i++)
      hooks[i].flags |= 8;
  }
}
function resolveAsyncComponentPlaceholder(anchorVnode) {
  if (anchorVnode.placeholder) {
    return anchorVnode.placeholder;
  }
  const instance = anchorVnode.component;
  if (instance) {
    return resolveAsyncComponentPlaceholder(instance.subTree);
  }
  return null;
}
const isSuspense = (type) => type.__isSuspense;
let suspenseId = 0;
const SuspenseImpl = {
  name: "Suspense",
  // In order to make Suspense tree-shakable, we need to avoid importing it
  // directly in the renderer. The renderer checks for the __isSuspense flag
  // on a vnode's type and calls the `process` method, passing in renderer
  // internals.
  __isSuspense: true,
  process(n1, n2, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, rendererInternals) {
    if (n1 == null) {
      mountSuspense(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        namespace,
        slotScopeIds,
        optimized,
        rendererInternals
      );
    } else {
      if (parentSuspense && parentSuspense.deps > 0 && !n1.suspense.isInFallback) {
        n2.suspense = n1.suspense;
        n2.suspense.vnode = n2;
        n2.el = n1.el;
        return;
      }
      patchSuspense(
        n1,
        n2,
        container,
        anchor,
        parentComponent,
        namespace,
        slotScopeIds,
        optimized,
        rendererInternals
      );
    }
  },
  hydrate: hydrateSuspense,
  normalize: normalizeSuspenseChildren
};
const Suspense = SuspenseImpl;
function triggerEvent(vnode, name) {
  const eventListener = vnode.props && vnode.props[name];
  if (isFunction(eventListener)) {
    eventListener();
  }
}
function mountSuspense(vnode, container, anchor, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, rendererInternals) {
  const {
    p: patch,
    o: { createElement }
  } = rendererInternals;
  const hiddenContainer = createElement("div");
  const suspense = vnode.suspense = createSuspenseBoundary(
    vnode,
    parentSuspense,
    parentComponent,
    container,
    hiddenContainer,
    anchor,
    namespace,
    slotScopeIds,
    optimized,
    rendererInternals
  );
  patch(
    null,
    suspense.pendingBranch = vnode.ssContent,
    hiddenContainer,
    null,
    parentComponent,
    suspense,
    namespace,
    slotScopeIds
  );
  if (suspense.deps > 0) {
    triggerEvent(vnode, "onPending");
    triggerEvent(vnode, "onFallback");
    patch(
      null,
      vnode.ssFallback,
      container,
      anchor,
      parentComponent,
      null,
      // fallback tree will not have suspense context
      namespace,
      slotScopeIds
    );
    setActiveBranch(suspense, vnode.ssFallback);
  } else {
    suspense.resolve(false, true);
  }
}
function patchSuspense(n1, n2, container, anchor, parentComponent, namespace, slotScopeIds, optimized, { p: patch, um: unmount, o: { createElement } }) {
  const suspense = n2.suspense = n1.suspense;
  suspense.vnode = n2;
  n2.el = n1.el;
  const newBranch = n2.ssContent;
  const newFallback = n2.ssFallback;
  const { activeBranch, pendingBranch, isInFallback, isHydrating } = suspense;
  if (pendingBranch) {
    suspense.pendingBranch = newBranch;
    if (isSameVNodeType(pendingBranch, newBranch)) {
      patch(
        pendingBranch,
        newBranch,
        suspense.hiddenContainer,
        null,
        parentComponent,
        suspense,
        namespace,
        slotScopeIds,
        optimized
      );
      if (suspense.deps <= 0) {
        suspense.resolve();
      } else if (isInFallback) {
        if (!isHydrating) {
          patch(
            activeBranch,
            newFallback,
            container,
            anchor,
            parentComponent,
            null,
            // fallback tree will not have suspense context
            namespace,
            slotScopeIds,
            optimized
          );
          setActiveBranch(suspense, newFallback);
        }
      }
    } else {
      suspense.pendingId = suspenseId++;
      if (isHydrating) {
        suspense.isHydrating = false;
        suspense.activeBranch = pendingBranch;
      } else {
        unmount(pendingBranch, parentComponent, suspense);
      }
      suspense.deps = 0;
      suspense.effects.length = 0;
      suspense.hiddenContainer = createElement("div");
      if (isInFallback) {
        patch(
          null,
          newBranch,
          suspense.hiddenContainer,
          null,
          parentComponent,
          suspense,
          namespace,
          slotScopeIds,
          optimized
        );
        if (suspense.deps <= 0) {
          suspense.resolve();
        } else {
          patch(
            activeBranch,
            newFallback,
            container,
            anchor,
            parentComponent,
            null,
            // fallback tree will not have suspense context
            namespace,
            slotScopeIds,
            optimized
          );
          setActiveBranch(suspense, newFallback);
        }
      } else if (activeBranch && isSameVNodeType(activeBranch, newBranch)) {
        patch(
          activeBranch,
          newBranch,
          container,
          anchor,
          parentComponent,
          suspense,
          namespace,
          slotScopeIds,
          optimized
        );
        suspense.resolve(true);
      } else {
        patch(
          null,
          newBranch,
          suspense.hiddenContainer,
          null,
          parentComponent,
          suspense,
          namespace,
          slotScopeIds,
          optimized
        );
        if (suspense.deps <= 0) {
          suspense.resolve();
        }
      }
    }
  } else {
    if (activeBranch && isSameVNodeType(activeBranch, newBranch)) {
      patch(
        activeBranch,
        newBranch,
        container,
        anchor,
        parentComponent,
        suspense,
        namespace,
        slotScopeIds,
        optimized
      );
      setActiveBranch(suspense, newBranch);
    } else {
      triggerEvent(n2, "onPending");
      suspense.pendingBranch = newBranch;
      if (newBranch.shapeFlag & 512) {
        suspense.pendingId = newBranch.component.suspenseId;
      } else {
        suspense.pendingId = suspenseId++;
      }
      patch(
        null,
        newBranch,
        suspense.hiddenContainer,
        null,
        parentComponent,
        suspense,
        namespace,
        slotScopeIds,
        optimized
      );
      if (suspense.deps <= 0) {
        suspense.resolve();
      } else {
        const { timeout, pendingId } = suspense;
        if (timeout > 0) {
          setTimeout(() => {
            if (suspense.pendingId === pendingId) {
              suspense.fallback(newFallback);
            }
          }, timeout);
        } else if (timeout === 0) {
          suspense.fallback(newFallback);
        }
      }
    }
  }
}
function createSuspenseBoundary(vnode, parentSuspense, parentComponent, container, hiddenContainer, anchor, namespace, slotScopeIds, optimized, rendererInternals, isHydrating = false) {
  const {
    p: patch,
    m: move,
    um: unmount,
    n: next,
    o: { parentNode, remove: remove2 }
  } = rendererInternals;
  let parentSuspenseId;
  const isSuspensible = isVNodeSuspensible(vnode);
  if (isSuspensible) {
    if (parentSuspense && parentSuspense.pendingBranch) {
      parentSuspenseId = parentSuspense.pendingId;
      parentSuspense.deps++;
    }
  }
  const timeout = vnode.props ? toNumber(vnode.props.timeout) : void 0;
  const initialAnchor = anchor;
  const suspense = {
    vnode,
    parent: parentSuspense,
    parentComponent,
    namespace,
    container,
    hiddenContainer,
    deps: 0,
    pendingId: suspenseId++,
    timeout: typeof timeout === "number" ? timeout : -1,
    activeBranch: null,
    isFallbackMountPending: false,
    pendingBranch: null,
    isInFallback: !isHydrating,
    isHydrating,
    isUnmounted: false,
    effects: [],
    resolve(resume = false, sync = false) {
      const {
        vnode: vnode2,
        activeBranch,
        pendingBranch,
        pendingId,
        effects,
        parentComponent: parentComponent2,
        container: container2,
        isInFallback
      } = suspense;
      let delayEnter = false;
      if (suspense.isHydrating) {
        suspense.isHydrating = false;
      } else if (!resume) {
        delayEnter = activeBranch && pendingBranch.transition && pendingBranch.transition.mode === "out-in";
        let hasUpdatedAnchor = false;
        if (delayEnter) {
          activeBranch.transition.afterLeave = () => {
            if (pendingId === suspense.pendingId) {
              move(
                pendingBranch,
                container2,
                anchor === initialAnchor && !hasUpdatedAnchor ? next(activeBranch) : anchor,
                0
              );
              queuePostFlushCb(effects);
              if (isInFallback && vnode2.ssFallback) {
                vnode2.ssFallback.el = null;
              }
            }
          };
        }
        if (activeBranch && !suspense.isFallbackMountPending) {
          if (parentNode(activeBranch.el) === container2) {
            anchor = next(activeBranch);
            hasUpdatedAnchor = true;
          }
          unmount(activeBranch, parentComponent2, suspense, true);
          if (!delayEnter && isInFallback && vnode2.ssFallback) {
            queuePostRenderEffect(() => vnode2.ssFallback.el = null, suspense);
          }
        }
        if (!delayEnter) {
          move(pendingBranch, container2, anchor, 0);
        }
      }
      suspense.isFallbackMountPending = false;
      setActiveBranch(suspense, pendingBranch);
      suspense.pendingBranch = null;
      suspense.isInFallback = false;
      let parent = suspense.parent;
      let hasUnresolvedAncestor = false;
      while (parent) {
        if (parent.pendingBranch) {
          parent.effects.push(...effects);
          hasUnresolvedAncestor = true;
          break;
        }
        parent = parent.parent;
      }
      if (!hasUnresolvedAncestor && !delayEnter) {
        queuePostFlushCb(effects);
      }
      suspense.effects = [];
      if (isSuspensible) {
        if (parentSuspense && parentSuspense.pendingBranch && parentSuspenseId === parentSuspense.pendingId) {
          parentSuspense.deps--;
          if (parentSuspense.deps === 0 && !sync) {
            parentSuspense.resolve();
          }
        }
      }
      triggerEvent(vnode2, "onResolve");
    },
    fallback(fallbackVNode) {
      if (!suspense.pendingBranch) {
        return;
      }
      const { vnode: vnode2, activeBranch, parentComponent: parentComponent2, container: container2, namespace: namespace2 } = suspense;
      triggerEvent(vnode2, "onFallback");
      const anchor2 = next(activeBranch);
      const mountFallback = () => {
        suspense.isFallbackMountPending = false;
        if (!suspense.isInFallback) {
          return;
        }
        patch(
          null,
          fallbackVNode,
          container2,
          anchor2,
          parentComponent2,
          null,
          // fallback tree will not have suspense context
          namespace2,
          slotScopeIds,
          optimized
        );
        setActiveBranch(suspense, fallbackVNode);
      };
      const delayEnter = fallbackVNode.transition && fallbackVNode.transition.mode === "out-in";
      if (delayEnter) {
        suspense.isFallbackMountPending = true;
        activeBranch.transition.afterLeave = mountFallback;
      }
      suspense.isInFallback = true;
      unmount(
        activeBranch,
        parentComponent2,
        null,
        // no suspense so unmount hooks fire now
        true
        // shouldRemove
      );
      if (!delayEnter) {
        mountFallback();
      }
    },
    move(container2, anchor2, type) {
      suspense.activeBranch && move(suspense.activeBranch, container2, anchor2, type);
      suspense.container = container2;
    },
    next() {
      return suspense.activeBranch && next(suspense.activeBranch);
    },
    registerDep(instance, setupRenderEffect, optimized2) {
      const isInPendingSuspense = !!suspense.pendingBranch;
      if (isInPendingSuspense) {
        suspense.deps++;
      }
      const hydratedEl = instance.vnode.el;
      instance.asyncDep.catch((err) => {
        handleError(err, instance, 0);
      }).then((asyncSetupResult) => {
        if (instance.isUnmounted || suspense.isUnmounted || suspense.pendingId !== instance.suspenseId) {
          return;
        }
        unsetCurrentInstance();
        instance.asyncResolved = true;
        const { vnode: vnode2 } = instance;
        handleSetupResult(instance, asyncSetupResult, false);
        if (hydratedEl) {
          vnode2.el = hydratedEl;
        }
        const placeholder = !hydratedEl && instance.subTree.el;
        setupRenderEffect(
          instance,
          vnode2,
          // component may have been moved before resolve.
          // if this is not a hydration, instance.subTree will be the comment
          // placeholder.
          parentNode(hydratedEl || instance.subTree.el),
          // anchor will not be used if this is hydration, so only need to
          // consider the comment placeholder case.
          hydratedEl ? null : next(instance.subTree),
          suspense,
          namespace,
          optimized2
        );
        if (placeholder) {
          vnode2.placeholder = null;
          remove2(placeholder);
        }
        updateHOCHostEl(instance, vnode2.el);
        if (isInPendingSuspense && --suspense.deps === 0) {
          suspense.resolve();
        }
      });
    },
    unmount(parentSuspense2, doRemove) {
      suspense.isUnmounted = true;
      if (suspense.activeBranch) {
        unmount(
          suspense.activeBranch,
          parentComponent,
          parentSuspense2,
          doRemove
        );
      }
      if (suspense.pendingBranch) {
        unmount(
          suspense.pendingBranch,
          parentComponent,
          parentSuspense2,
          doRemove
        );
      }
    }
  };
  return suspense;
}
function hydrateSuspense(node, vnode, parentComponent, parentSuspense, namespace, slotScopeIds, optimized, rendererInternals, hydrateNode) {
  const suspense = vnode.suspense = createSuspenseBoundary(
    vnode,
    parentSuspense,
    parentComponent,
    node.parentNode,
    // eslint-disable-next-line no-restricted-globals
    document.createElement("div"),
    null,
    namespace,
    slotScopeIds,
    optimized,
    rendererInternals,
    true
  );
  const result = hydrateNode(
    node,
    suspense.pendingBranch = vnode.ssContent,
    parentComponent,
    suspense,
    slotScopeIds,
    optimized
  );
  if (suspense.deps === 0) {
    suspense.resolve(false, true);
  }
  return result;
}
function normalizeSuspenseChildren(vnode) {
  const { shapeFlag, children } = vnode;
  const isSlotChildren = shapeFlag & 32;
  vnode.ssContent = normalizeSuspenseSlot(
    isSlotChildren ? children.default : children
  );
  vnode.ssFallback = isSlotChildren ? normalizeSuspenseSlot(children.fallback) : createVNode(Comment);
}
function normalizeSuspenseSlot(s) {
  let block;
  if (isFunction(s)) {
    const trackBlock = isBlockTreeEnabled && s._c;
    if (trackBlock) {
      s._d = false;
      openBlock();
    }
    s = s();
    if (trackBlock) {
      s._d = true;
      block = currentBlock;
      closeBlock();
    }
  }
  if (isArray(s)) {
    const singleChild = filterSingleRoot(s);
    s = singleChild;
  }
  s = normalizeVNode(s);
  if (block && !s.dynamicChildren) {
    s.dynamicChildren = block.filter((c) => c !== s);
  }
  return s;
}
function queueEffectWithSuspense(fn, suspense) {
  if (suspense && suspense.pendingBranch) {
    if (isArray(fn)) {
      suspense.effects.push(...fn);
    } else {
      suspense.effects.push(fn);
    }
  } else {
    queuePostFlushCb(fn);
  }
}
function setActiveBranch(suspense, branch) {
  suspense.activeBranch = branch;
  const { vnode, parentComponent } = suspense;
  let el = branch.el;
  while (!el && branch.component) {
    branch = branch.component.subTree;
    el = branch.el;
  }
  vnode.el = el;
  if (parentComponent && parentComponent.subTree === vnode) {
    parentComponent.vnode.el = el;
    updateHOCHostEl(parentComponent, el);
  }
}
function isVNodeSuspensible(vnode) {
  const suspensible = vnode.props && vnode.props.suspensible;
  return suspensible != null && suspensible !== false;
}
const Fragment = /* @__PURE__ */ Symbol.for("v-fgt");
const Text = /* @__PURE__ */ Symbol.for("v-txt");
const Comment = /* @__PURE__ */ Symbol.for("v-cmt");
const Static = /* @__PURE__ */ Symbol.for("v-stc");
const blockStack = [];
let currentBlock = null;
function openBlock(disableTracking = false) {
  blockStack.push(currentBlock = disableTracking ? null : []);
}
function closeBlock() {
  blockStack.pop();
  currentBlock = blockStack[blockStack.length - 1] || null;
}
let isBlockTreeEnabled = 1;
function setBlockTracking(value, inVOnce = false) {
  isBlockTreeEnabled += value;
  if (value < 0 && currentBlock && inVOnce) {
    currentBlock.hasOnce = true;
  }
}
function setupBlock(vnode) {
  vnode.dynamicChildren = isBlockTreeEnabled > 0 ? currentBlock || EMPTY_ARR : null;
  closeBlock();
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(vnode);
  }
  return vnode;
}
function createElementBlock(type, props, children, patchFlag, dynamicProps, shapeFlag) {
  return setupBlock(
    createBaseVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      shapeFlag,
      true
    )
  );
}
function createBlock(type, props, children, patchFlag, dynamicProps) {
  return setupBlock(
    createVNode(
      type,
      props,
      children,
      patchFlag,
      dynamicProps,
      true
    )
  );
}
function isVNode(value) {
  return value ? value.__v_isVNode === true : false;
}
function isSameVNodeType(n1, n2) {
  return n1.type === n2.type && n1.key === n2.key;
}
function transformVNodeArgs(transformer) {
}
const normalizeKey = ({ key }) => key != null ? key : null;
const normalizeRef = ({
  ref: ref3,
  ref_key,
  ref_for
}) => {
  if (typeof ref3 === "number") {
    ref3 = "" + ref3;
  }
  return ref3 != null ? isString(ref3) || /* @__PURE__ */ isRef(ref3) || isFunction(ref3) ? { i: currentRenderingInstance, r: ref3, k: ref_key, f: !!ref_for } : ref3 : null;
};
function createBaseVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, shapeFlag = type === Fragment ? 0 : 1, isBlockNode = false, needFullChildrenNormalization = false) {
  const vnode = {
    __v_isVNode: true,
    __v_skip: true,
    type,
    props,
    key: props && normalizeKey(props),
    ref: props && normalizeRef(props),
    scopeId: currentScopeId,
    slotScopeIds: null,
    children,
    component: null,
    suspense: null,
    ssContent: null,
    ssFallback: null,
    dirs: null,
    transition: null,
    el: null,
    anchor: null,
    target: null,
    targetStart: null,
    targetAnchor: null,
    staticCount: 0,
    shapeFlag,
    patchFlag,
    dynamicProps,
    dynamicChildren: null,
    appContext: null,
    ctx: currentRenderingInstance
  };
  if (needFullChildrenNormalization) {
    normalizeChildren(vnode, children);
    if (shapeFlag & 128) {
      type.normalize(vnode);
    }
  } else if (children) {
    vnode.shapeFlag |= isString(children) ? 8 : 16;
  }
  if (isBlockTreeEnabled > 0 && // avoid a block node from tracking itself
  !isBlockNode && // has current parent block
  currentBlock && // presence of a patch flag indicates this node needs patching on updates.
  // component nodes also should always be patched, because even if the
  // component doesn't need to update, it needs to persist the instance on to
  // the next vnode so that it can be properly unmounted later.
  (vnode.patchFlag > 0 || shapeFlag & 6) && // the EVENTS flag is only for hydration and if it is the only flag, the
  // vnode should not be considered dynamic due to handler caching.
  vnode.patchFlag !== 32) {
    currentBlock.push(vnode);
  }
  return vnode;
}
const createVNode = _createVNode;
function _createVNode(type, props = null, children = null, patchFlag = 0, dynamicProps = null, isBlockNode = false) {
  if (!type || type === NULL_DYNAMIC_COMPONENT) {
    type = Comment;
  }
  if (isVNode(type)) {
    const cloned = cloneVNode(
      type,
      props,
      true
      /* mergeRef: true */
    );
    if (children) {
      normalizeChildren(cloned, children);
    }
    if (isBlockTreeEnabled > 0 && !isBlockNode && currentBlock) {
      if (cloned.shapeFlag & 6) {
        currentBlock[currentBlock.indexOf(type)] = cloned;
      } else {
        currentBlock.push(cloned);
      }
    }
    cloned.patchFlag = -2;
    return cloned;
  }
  if (isClassComponent(type)) {
    type = type.__vccOpts;
  }
  if (props) {
    props = guardReactiveProps(props);
    let { class: klass, style } = props;
    if (klass && !isString(klass)) {
      props.class = normalizeClass(klass);
    }
    if (isObject$2(style)) {
      if (/* @__PURE__ */ isProxy(style) && !isArray(style)) {
        style = extend({}, style);
      }
      props.style = normalizeStyle(style);
    }
  }
  const shapeFlag = isString(type) ? 1 : isSuspense(type) ? 128 : isTeleport(type) ? 64 : isObject$2(type) ? 4 : isFunction(type) ? 2 : 0;
  return createBaseVNode(
    type,
    props,
    children,
    patchFlag,
    dynamicProps,
    shapeFlag,
    isBlockNode,
    true
  );
}
function guardReactiveProps(props) {
  if (!props) return null;
  return /* @__PURE__ */ isProxy(props) || isInternalObject(props) ? extend({}, props) : props;
}
function cloneVNode(vnode, extraProps, mergeRef = false, cloneTransition = false) {
  const { props, ref: ref3, patchFlag, children, transition } = vnode;
  const mergedProps = extraProps ? mergeProps(props || {}, extraProps) : props;
  const cloned = {
    __v_isVNode: true,
    __v_skip: true,
    type: vnode.type,
    props: mergedProps,
    key: mergedProps && normalizeKey(mergedProps),
    ref: extraProps && extraProps.ref ? (
      // #2078 in the case of <component :is="vnode" ref="extra"/>
      // if the vnode itself already has a ref, cloneVNode will need to merge
      // the refs so the single vnode can be set on multiple refs
      mergeRef && ref3 ? isArray(ref3) ? ref3.concat(normalizeRef(extraProps)) : [ref3, normalizeRef(extraProps)] : normalizeRef(extraProps)
    ) : ref3,
    scopeId: vnode.scopeId,
    slotScopeIds: vnode.slotScopeIds,
    children,
    target: vnode.target,
    targetStart: vnode.targetStart,
    targetAnchor: vnode.targetAnchor,
    staticCount: vnode.staticCount,
    shapeFlag: vnode.shapeFlag,
    // if the vnode is cloned with extra props, we can no longer assume its
    // existing patch flag to be reliable and need to add the FULL_PROPS flag.
    // note: preserve flag for fragments since they use the flag for children
    // fast paths only.
    patchFlag: extraProps && vnode.type !== Fragment ? patchFlag === -1 ? 16 : patchFlag | 16 : patchFlag,
    dynamicProps: vnode.dynamicProps,
    dynamicChildren: vnode.dynamicChildren,
    appContext: vnode.appContext,
    dirs: vnode.dirs,
    transition,
    // These should technically only be non-null on mounted VNodes. However,
    // they *should* be copied for kept-alive vnodes. So we just always copy
    // them since them being non-null during a mount doesn't affect the logic as
    // they will simply be overwritten.
    component: vnode.component,
    suspense: vnode.suspense,
    ssContent: vnode.ssContent && cloneVNode(vnode.ssContent),
    ssFallback: vnode.ssFallback && cloneVNode(vnode.ssFallback),
    placeholder: vnode.placeholder,
    el: vnode.el,
    anchor: vnode.anchor,
    ctx: vnode.ctx,
    ce: vnode.ce
  };
  if (transition && cloneTransition) {
    setTransitionHooks(
      cloned,
      transition.clone(cloned)
    );
  }
  return cloned;
}
function createTextVNode(text = " ", flag = 0) {
  return createVNode(Text, null, text, flag);
}
function createStaticVNode(content, numberOfNodes) {
  const vnode = createVNode(Static, null, content);
  vnode.staticCount = numberOfNodes;
  return vnode;
}
function createCommentVNode(text = "", asBlock = false) {
  return asBlock ? (openBlock(), createBlock(Comment, null, text)) : createVNode(Comment, null, text);
}
function normalizeVNode(child) {
  if (child == null || typeof child === "boolean") {
    return createVNode(Comment);
  } else if (isArray(child)) {
    return createVNode(
      Fragment,
      null,
      // #3666, avoid reference pollution when reusing vnode
      child.slice()
    );
  } else if (isVNode(child)) {
    return cloneIfMounted(child);
  } else {
    return createVNode(Text, null, String(child));
  }
}
function cloneIfMounted(child) {
  return child.el === null && child.patchFlag !== -1 || child.memo ? child : cloneVNode(child);
}
function normalizeChildren(vnode, children) {
  let type = 0;
  const { shapeFlag } = vnode;
  if (children == null) {
    children = null;
  } else if (isArray(children)) {
    type = 16;
  } else if (typeof children === "object") {
    if (shapeFlag & (1 | 64)) {
      const slot = children.default;
      if (slot) {
        slot._c && (slot._d = false);
        normalizeChildren(vnode, slot());
        slot._c && (slot._d = true);
      }
      return;
    } else {
      type = 32;
      const slotFlag = children._;
      if (!slotFlag && !isInternalObject(children)) {
        children._ctx = currentRenderingInstance;
      } else if (slotFlag === 3 && currentRenderingInstance) {
        if (currentRenderingInstance.slots._ === 1) {
          children._ = 1;
        } else {
          children._ = 2;
          vnode.patchFlag |= 1024;
        }
      }
    }
  } else if (isFunction(children)) {
    if (shapeFlag & (1 | 64)) {
      normalizeChildren(vnode, { default: children });
      return;
    }
    children = { default: children, _ctx: currentRenderingInstance };
    type = 32;
  } else {
    children = String(children);
    if (shapeFlag & 64) {
      type = 16;
      children = [createTextVNode(children)];
    } else {
      type = 8;
    }
  }
  vnode.children = children;
  vnode.shapeFlag |= type;
}
function mergeProps(...args) {
  const ret = {};
  for (let i = 0; i < args.length; i++) {
    const toMerge = args[i];
    for (const key in toMerge) {
      if (key === "class") {
        if (ret.class !== toMerge.class) {
          ret.class = normalizeClass([ret.class, toMerge.class]);
        }
      } else if (key === "style") {
        ret.style = normalizeStyle([ret.style, toMerge.style]);
      } else if (isOn(key)) {
        const existing = ret[key];
        const incoming = toMerge[key];
        if (incoming && existing !== incoming && !(isArray(existing) && existing.includes(incoming))) {
          ret[key] = existing ? [].concat(existing, incoming) : incoming;
        } else if (incoming == null && existing == null && // mergeProps({ 'onUpdate:modelValue': undefined }) should not retain
        // the model listener.
        !isModelListener(key)) {
          ret[key] = incoming;
        }
      } else if (key !== "") {
        ret[key] = toMerge[key];
      }
    }
  }
  return ret;
}
function invokeVNodeHook(hook, instance, vnode, prevVNode = null) {
  callWithAsyncErrorHandling(hook, instance, 7, [
    vnode,
    prevVNode
  ]);
}
const emptyAppContext = createAppContext();
let uid = 0;
function createComponentInstance(vnode, parent, suspense) {
  const type = vnode.type;
  const appContext = (parent ? parent.appContext : vnode.appContext) || emptyAppContext;
  const instance = {
    uid: uid++,
    vnode,
    type,
    parent,
    appContext,
    root: null,
    // to be immediately set
    next: null,
    subTree: null,
    // will be set synchronously right after creation
    effect: null,
    update: null,
    // will be set synchronously right after creation
    job: null,
    scope: new EffectScope(
      true
      /* detached */
    ),
    render: null,
    proxy: null,
    exposed: null,
    exposeProxy: null,
    withProxy: null,
    provides: parent ? parent.provides : Object.create(appContext.provides),
    ids: parent ? parent.ids : ["", 0, 0],
    accessCache: null,
    renderCache: [],
    // local resolved assets
    components: null,
    directives: null,
    // resolved props and emits options
    propsOptions: normalizePropsOptions(type, appContext),
    emitsOptions: normalizeEmitsOptions(type, appContext),
    // emit
    emit: null,
    // to be set immediately
    emitted: null,
    // props default value
    propsDefaults: EMPTY_OBJ,
    // inheritAttrs
    inheritAttrs: type.inheritAttrs,
    // state
    ctx: EMPTY_OBJ,
    data: EMPTY_OBJ,
    props: EMPTY_OBJ,
    attrs: EMPTY_OBJ,
    slots: EMPTY_OBJ,
    refs: EMPTY_OBJ,
    setupState: EMPTY_OBJ,
    setupContext: null,
    // suspense related
    suspense,
    suspenseId: suspense ? suspense.pendingId : 0,
    asyncDep: null,
    asyncResolved: false,
    // lifecycle hooks
    // not using enums here because it results in computed properties
    isMounted: false,
    isUnmounted: false,
    isDeactivated: false,
    bc: null,
    c: null,
    bm: null,
    m: null,
    bu: null,
    u: null,
    um: null,
    bum: null,
    da: null,
    a: null,
    rtg: null,
    rtc: null,
    ec: null,
    sp: null
  };
  {
    instance.ctx = { _: instance };
  }
  instance.root = parent ? parent.root : instance;
  instance.emit = emit.bind(null, instance);
  if (vnode.ce) {
    vnode.ce(instance);
  }
  return instance;
}
let currentInstance = null;
const getCurrentInstance = () => currentInstance || currentRenderingInstance;
let internalSetCurrentInstance;
let setInSSRSetupState;
{
  const g = getGlobalThis();
  const registerGlobalSetter = (key, setter) => {
    let setters;
    if (!(setters = g[key])) setters = g[key] = [];
    setters.push(setter);
    return (v) => {
      if (setters.length > 1) setters.forEach((set2) => set2(v));
      else setters[0](v);
    };
  };
  internalSetCurrentInstance = registerGlobalSetter(
    `__VUE_INSTANCE_SETTERS__`,
    (v) => currentInstance = v
  );
  setInSSRSetupState = registerGlobalSetter(
    `__VUE_SSR_SETTERS__`,
    (v) => isInSSRComponentSetup = v
  );
}
const setCurrentInstance = (instance) => {
  const prev = currentInstance;
  internalSetCurrentInstance(instance);
  instance.scope.on();
  return () => {
    instance.scope.off();
    internalSetCurrentInstance(prev);
  };
};
const unsetCurrentInstance = () => {
  currentInstance && currentInstance.scope.off();
  internalSetCurrentInstance(null);
};
function isStatefulComponent(instance) {
  return instance.vnode.shapeFlag & 4;
}
let isInSSRComponentSetup = false;
function setupComponent(instance, isSSR = false, optimized = false) {
  isSSR && setInSSRSetupState(isSSR);
  const { props, children } = instance.vnode;
  const isStateful = isStatefulComponent(instance);
  initProps(instance, props, isStateful, isSSR);
  initSlots(instance, children, optimized || isSSR);
  const setupResult = isStateful ? setupStatefulComponent(instance, isSSR) : void 0;
  isSSR && setInSSRSetupState(false);
  return setupResult;
}
function setupStatefulComponent(instance, isSSR) {
  const Component = instance.type;
  instance.accessCache = /* @__PURE__ */ Object.create(null);
  instance.proxy = new Proxy(instance.ctx, PublicInstanceProxyHandlers);
  const { setup } = Component;
  if (setup) {
    pauseTracking();
    const setupContext = instance.setupContext = setup.length > 1 ? createSetupContext(instance) : null;
    const reset = setCurrentInstance(instance);
    const setupResult = callWithErrorHandling(
      setup,
      instance,
      0,
      [
        instance.props,
        setupContext
      ]
    );
    const isAsyncSetup = isPromise(setupResult);
    resetTracking();
    reset();
    if ((isAsyncSetup || instance.sp) && !isAsyncWrapper(instance)) {
      markAsyncBoundary(instance);
    }
    if (isAsyncSetup) {
      setupResult.then(unsetCurrentInstance, unsetCurrentInstance);
      if (isSSR) {
        return setupResult.then((resolvedResult) => {
          handleSetupResult(instance, resolvedResult, isSSR);
        }).catch((e) => {
          handleError(e, instance, 0);
        });
      } else {
        instance.asyncDep = setupResult;
      }
    } else {
      handleSetupResult(instance, setupResult, isSSR);
    }
  } else {
    finishComponentSetup(instance, isSSR);
  }
}
function handleSetupResult(instance, setupResult, isSSR) {
  if (isFunction(setupResult)) {
    if (instance.type.__ssrInlineRender) {
      instance.ssrRender = setupResult;
    } else {
      instance.render = setupResult;
    }
  } else if (isObject$2(setupResult)) {
    instance.setupState = proxyRefs(setupResult);
  } else ;
  finishComponentSetup(instance, isSSR);
}
let compile$1;
let installWithProxy;
function registerRuntimeCompiler(_compile) {
  compile$1 = _compile;
  installWithProxy = (i) => {
    if (i.render._rc) {
      i.withProxy = new Proxy(i.ctx, RuntimeCompiledPublicInstanceProxyHandlers);
    }
  };
}
const isRuntimeOnly = () => !compile$1;
function finishComponentSetup(instance, isSSR, skipOptions) {
  const Component = instance.type;
  if (!instance.render) {
    if (!isSSR && compile$1 && !Component.render) {
      const template = Component.template || resolveMergedOptions(instance).template;
      if (template) {
        const { isCustomElement, compilerOptions } = instance.appContext.config;
        const { delimiters, compilerOptions: componentCompilerOptions } = Component;
        const finalCompilerOptions = extend(
          extend(
            {
              isCustomElement,
              delimiters
            },
            compilerOptions
          ),
          componentCompilerOptions
        );
        Component.render = compile$1(template, finalCompilerOptions);
      }
    }
    instance.render = Component.render || NOOP;
    if (installWithProxy) {
      installWithProxy(instance);
    }
  }
  {
    const reset = setCurrentInstance(instance);
    pauseTracking();
    try {
      applyOptions(instance);
    } finally {
      resetTracking();
      reset();
    }
  }
}
const attrsProxyHandlers = {
  get(target, key) {
    track(target, "get", "");
    return target[key];
  }
};
function createSetupContext(instance) {
  const expose = (exposed) => {
    instance.exposed = exposed || {};
  };
  {
    return {
      attrs: new Proxy(instance.attrs, attrsProxyHandlers),
      slots: instance.slots,
      emit: instance.emit,
      expose
    };
  }
}
function getComponentPublicInstance(instance) {
  if (instance.exposed) {
    return instance.exposeProxy || (instance.exposeProxy = new Proxy(proxyRefs(markRaw(instance.exposed)), {
      get(target, key) {
        if (key in target) {
          return target[key];
        } else if (key in publicPropertiesMap) {
          return publicPropertiesMap[key](instance);
        }
      },
      has(target, key) {
        return key in target || key in publicPropertiesMap;
      }
    }));
  } else {
    return instance.proxy;
  }
}
const classifyRE = /(?:^|[-_])\w/g;
const classify = (str) => str.replace(classifyRE, (c) => c.toUpperCase()).replace(/[-_]/g, "");
function getComponentName(Component, includeInferred = true) {
  return isFunction(Component) ? Component.displayName || Component.name : Component.name || includeInferred && Component.__name;
}
function formatComponentName(instance, Component, isRoot = false) {
  let name = getComponentName(Component);
  if (!name && Component.__file) {
    const match = Component.__file.match(/([^/\\]+)\.\w+$/);
    if (match) {
      name = match[1];
    }
  }
  if (!name && instance) {
    const inferFromRegistry = (registry) => {
      for (const key in registry) {
        if (registry[key] === Component) {
          return key;
        }
      }
    };
    name = inferFromRegistry(instance.components) || instance.parent && inferFromRegistry(
      instance.parent.type.components
    ) || inferFromRegistry(instance.appContext.components);
  }
  return name ? classify(name) : isRoot ? `App` : `Anonymous`;
}
function isClassComponent(value) {
  return isFunction(value) && "__vccOpts" in value;
}
const computed = (getterOrOptions, debugOptions) => {
  const c = /* @__PURE__ */ computed$1(getterOrOptions, debugOptions, isInSSRComponentSetup);
  return c;
};
function h(type, propsOrChildren, children) {
  try {
    setBlockTracking(-1);
    const l = arguments.length;
    if (l === 2) {
      if (isObject$2(propsOrChildren) && !isArray(propsOrChildren)) {
        if (isVNode(propsOrChildren)) {
          return createVNode(type, null, [propsOrChildren]);
        }
        return createVNode(type, propsOrChildren);
      } else {
        return createVNode(type, null, propsOrChildren);
      }
    } else {
      if (l > 3) {
        children = Array.prototype.slice.call(arguments, 2);
      } else if (l === 3 && isVNode(children)) {
        children = [children];
      }
      return createVNode(type, propsOrChildren, children);
    }
  } finally {
    setBlockTracking(1);
  }
}
function initCustomFormatter() {
  {
    return;
  }
}
function withMemo(memo, render2, cache, index) {
  const cached = cache[index];
  if (cached && isMemoSame(cached, memo)) {
    return cached;
  }
  const ret = render2();
  ret.memo = memo.slice();
  ret.cacheIndex = index;
  return cache[index] = ret;
}
function isMemoSame(cached, memo) {
  const prev = cached.memo;
  if (prev.length != memo.length) {
    return false;
  }
  for (let i = 0; i < prev.length; i++) {
    if (hasChanged(prev[i], memo[i])) {
      return false;
    }
  }
  if (isBlockTreeEnabled > 0 && currentBlock) {
    currentBlock.push(cached);
  }
  return true;
}
const version = "3.5.40";
const warn = NOOP;
const ErrorTypeStrings = ErrorTypeStrings$1;
const devtools = devtools$1;
const setDevtoolsHook = setDevtoolsHook$1;
const _ssrUtils = {
  createComponentInstance,
  setupComponent,
  renderComponentRoot,
  setCurrentRenderingInstance,
  isVNode,
  normalizeVNode,
  getComponentPublicInstance,
  ensureValidVNode,
  pushWarningContext,
  popWarningContext
};
const ssrUtils = _ssrUtils;
const resolveFilter = null;
const compatUtils = null;
const DeprecationTypes = null;
/**
* @vue/runtime-dom v3.5.40
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
let policy = void 0;
const tt = typeof window !== "undefined" && window.trustedTypes;
if (tt) {
  try {
    policy = /* @__PURE__ */ tt.createPolicy("vue", {
      createHTML: (val) => val
    });
  } catch (e) {
  }
}
const unsafeToTrustedHTML = policy ? (val) => policy.createHTML(val) : (val) => val;
const svgNS = "http://www.w3.org/2000/svg";
const mathmlNS = "http://www.w3.org/1998/Math/MathML";
const doc = typeof document !== "undefined" ? document : null;
const templateContainer = doc && /* @__PURE__ */ doc.createElement("template");
const nodeOps = {
  insert: (child, parent, anchor) => {
    parent.insertBefore(child, anchor || null);
  },
  remove: (child) => {
    const parent = child.parentNode;
    if (parent) {
      parent.removeChild(child);
    }
  },
  createElement: (tag, namespace, is, props) => {
    const el = namespace === "svg" ? doc.createElementNS(svgNS, tag) : namespace === "mathml" ? doc.createElementNS(mathmlNS, tag) : is ? doc.createElement(tag, { is }) : doc.createElement(tag);
    if (tag === "select" && props && props.multiple != null) {
      el.setAttribute("multiple", props.multiple);
    }
    return el;
  },
  createText: (text) => doc.createTextNode(text),
  createComment: (text) => doc.createComment(text),
  setText: (node, text) => {
    node.nodeValue = text;
  },
  setElementText: (el, text) => {
    el.textContent = text;
  },
  parentNode: (node) => node.parentNode,
  nextSibling: (node) => node.nextSibling,
  querySelector: (selector) => doc.querySelector(selector),
  setScopeId(el, id) {
    el.setAttribute(id, "");
  },
  // __UNSAFE__
  // Reason: innerHTML.
  // Static content here can only come from compiled templates.
  // As long as the user only uses trusted templates, this is safe.
  insertStaticContent(content, parent, anchor, namespace, start, end) {
    const before = anchor ? anchor.previousSibling : parent.lastChild;
    if (start && (start === end || start.nextSibling)) {
      while (true) {
        parent.insertBefore(start.cloneNode(true), anchor);
        if (start === end || !(start = start.nextSibling)) break;
      }
    } else {
      templateContainer.innerHTML = unsafeToTrustedHTML(
        namespace === "svg" ? `<svg>${content}</svg>` : namespace === "mathml" ? `<math>${content}</math>` : content
      );
      const template = templateContainer.content;
      if (namespace === "svg" || namespace === "mathml") {
        const wrapper = template.firstChild;
        while (wrapper.firstChild) {
          template.appendChild(wrapper.firstChild);
        }
        template.removeChild(wrapper);
      }
      parent.insertBefore(template, anchor);
    }
    return [
      // first
      before ? before.nextSibling : parent.firstChild,
      // last
      anchor ? anchor.previousSibling : parent.lastChild
    ];
  }
};
const TRANSITION = "transition";
const ANIMATION = "animation";
const vtcKey = /* @__PURE__ */ Symbol("_vtc");
const DOMTransitionPropsValidators = {
  name: String,
  type: String,
  css: {
    type: Boolean,
    default: true
  },
  duration: [String, Number, Object],
  enterFromClass: String,
  enterActiveClass: String,
  enterToClass: String,
  appearFromClass: String,
  appearActiveClass: String,
  appearToClass: String,
  leaveFromClass: String,
  leaveActiveClass: String,
  leaveToClass: String
};
const TransitionPropsValidators = /* @__PURE__ */ extend(
  {},
  BaseTransitionPropsValidators,
  DOMTransitionPropsValidators
);
const decorate$1 = (t) => {
  t.displayName = "Transition";
  t.props = TransitionPropsValidators;
  return t;
};
const Transition = /* @__PURE__ */ decorate$1(
  (props, { slots }) => h(BaseTransition, resolveTransitionProps(props), slots)
);
const callHook = (hook, args = []) => {
  if (isArray(hook)) {
    hook.forEach((h2) => h2(...args));
  } else if (hook) {
    hook(...args);
  }
};
const hasExplicitCallback = (hook) => {
  return hook ? isArray(hook) ? hook.some((h2) => h2.length > 1) : hook.length > 1 : false;
};
function resolveTransitionProps(rawProps) {
  const baseProps = {};
  for (const key in rawProps) {
    if (!(key in DOMTransitionPropsValidators)) {
      baseProps[key] = rawProps[key];
    }
  }
  if (rawProps.css === false) {
    return baseProps;
  }
  const {
    name = "v",
    type,
    duration,
    enterFromClass = `${name}-enter-from`,
    enterActiveClass = `${name}-enter-active`,
    enterToClass = `${name}-enter-to`,
    appearFromClass = enterFromClass,
    appearActiveClass = enterActiveClass,
    appearToClass = enterToClass,
    leaveFromClass = `${name}-leave-from`,
    leaveActiveClass = `${name}-leave-active`,
    leaveToClass = `${name}-leave-to`
  } = rawProps;
  const durations = normalizeDuration(duration);
  const enterDuration = durations && durations[0];
  const leaveDuration = durations && durations[1];
  const {
    onBeforeEnter,
    onEnter,
    onEnterCancelled,
    onLeave,
    onLeaveCancelled,
    onBeforeAppear = onBeforeEnter,
    onAppear = onEnter,
    onAppearCancelled = onEnterCancelled
  } = baseProps;
  const finishEnter = (el, isAppear, done, isCancelled) => {
    el._enterCancelled = isCancelled;
    removeTransitionClass(el, isAppear ? appearToClass : enterToClass);
    removeTransitionClass(el, isAppear ? appearActiveClass : enterActiveClass);
    done && done();
  };
  const finishLeave = (el, done) => {
    el._isLeaving = false;
    removeTransitionClass(el, leaveFromClass);
    removeTransitionClass(el, leaveToClass);
    removeTransitionClass(el, leaveActiveClass);
    done && done();
  };
  const makeEnterHook = (isAppear) => {
    return (el, done) => {
      const hook = isAppear ? onAppear : onEnter;
      const resolve2 = () => finishEnter(el, isAppear, done);
      callHook(hook, [el, resolve2]);
      nextFrame(() => {
        removeTransitionClass(el, isAppear ? appearFromClass : enterFromClass);
        addTransitionClass(el, isAppear ? appearToClass : enterToClass);
        if (!hasExplicitCallback(hook)) {
          whenTransitionEnds(el, type, enterDuration, resolve2);
        }
      });
    };
  };
  return extend(baseProps, {
    onBeforeEnter(el) {
      callHook(onBeforeEnter, [el]);
      addTransitionClass(el, enterFromClass);
      addTransitionClass(el, enterActiveClass);
    },
    onBeforeAppear(el) {
      callHook(onBeforeAppear, [el]);
      addTransitionClass(el, appearFromClass);
      addTransitionClass(el, appearActiveClass);
    },
    onEnter: makeEnterHook(false),
    onAppear: makeEnterHook(true),
    onLeave(el, done) {
      el._isLeaving = true;
      const resolve2 = () => finishLeave(el, done);
      addTransitionClass(el, leaveFromClass);
      if (!el._enterCancelled) {
        forceReflow(el);
        addTransitionClass(el, leaveActiveClass);
      } else {
        addTransitionClass(el, leaveActiveClass);
        forceReflow(el);
      }
      nextFrame(() => {
        if (!el._isLeaving) {
          return;
        }
        removeTransitionClass(el, leaveFromClass);
        addTransitionClass(el, leaveToClass);
        if (!hasExplicitCallback(onLeave)) {
          whenTransitionEnds(el, type, leaveDuration, resolve2);
        }
      });
      callHook(onLeave, [el, resolve2]);
    },
    onEnterCancelled(el) {
      finishEnter(el, false, void 0, true);
      callHook(onEnterCancelled, [el]);
    },
    onAppearCancelled(el) {
      finishEnter(el, true, void 0, true);
      callHook(onAppearCancelled, [el]);
    },
    onLeaveCancelled(el) {
      finishLeave(el);
      callHook(onLeaveCancelled, [el]);
    }
  });
}
function normalizeDuration(duration) {
  if (duration == null) {
    return null;
  } else if (isObject$2(duration)) {
    return [NumberOf(duration.enter), NumberOf(duration.leave)];
  } else {
    const n = NumberOf(duration);
    return [n, n];
  }
}
function NumberOf(val) {
  const res = toNumber(val);
  return res;
}
function addTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c) => c && el.classList.add(c));
  (el[vtcKey] || (el[vtcKey] = /* @__PURE__ */ new Set())).add(cls);
}
function removeTransitionClass(el, cls) {
  cls.split(/\s+/).forEach((c) => c && el.classList.remove(c));
  const _vtc = el[vtcKey];
  if (_vtc) {
    _vtc.delete(cls);
    if (!_vtc.size) {
      el[vtcKey] = void 0;
    }
  }
}
function nextFrame(cb) {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb);
  });
}
let endId = 0;
function whenTransitionEnds(el, expectedType, explicitTimeout, resolve2) {
  const id = el._endId = ++endId;
  const resolveIfNotStale = () => {
    if (id === el._endId) {
      resolve2();
    }
  };
  if (explicitTimeout != null) {
    return setTimeout(resolveIfNotStale, explicitTimeout);
  }
  const { type, timeout, propCount } = getTransitionInfo(el, expectedType);
  if (!type) {
    return resolve2();
  }
  const endEvent = type + "end";
  let ended = 0;
  const end = () => {
    el.removeEventListener(endEvent, onEnd);
    resolveIfNotStale();
  };
  const onEnd = (e) => {
    if (e.target === el && ++ended >= propCount) {
      end();
    }
  };
  setTimeout(() => {
    if (ended < propCount) {
      end();
    }
  }, timeout + 1);
  el.addEventListener(endEvent, onEnd);
}
function getTransitionInfo(el, expectedType) {
  const styles = window.getComputedStyle(el);
  const getStyleProperties = (key) => (styles[key] || "").split(", ");
  const transitionDelays = getStyleProperties(`${TRANSITION}Delay`);
  const transitionDurations = getStyleProperties(`${TRANSITION}Duration`);
  const transitionTimeout = getTimeout(transitionDelays, transitionDurations);
  const animationDelays = getStyleProperties(`${ANIMATION}Delay`);
  const animationDurations = getStyleProperties(`${ANIMATION}Duration`);
  const animationTimeout = getTimeout(animationDelays, animationDurations);
  let type = null;
  let timeout = 0;
  let propCount = 0;
  if (expectedType === TRANSITION) {
    if (transitionTimeout > 0) {
      type = TRANSITION;
      timeout = transitionTimeout;
      propCount = transitionDurations.length;
    }
  } else if (expectedType === ANIMATION) {
    if (animationTimeout > 0) {
      type = ANIMATION;
      timeout = animationTimeout;
      propCount = animationDurations.length;
    }
  } else {
    timeout = Math.max(transitionTimeout, animationTimeout);
    type = timeout > 0 ? transitionTimeout > animationTimeout ? TRANSITION : ANIMATION : null;
    propCount = type ? type === TRANSITION ? transitionDurations.length : animationDurations.length : 0;
  }
  const hasTransform = type === TRANSITION && /\b(?:transform|all)(?:,|$)/.test(
    getStyleProperties(`${TRANSITION}Property`).toString()
  );
  return {
    type,
    timeout,
    propCount,
    hasTransform
  };
}
function getTimeout(delays, durations) {
  while (delays.length < durations.length) {
    delays = delays.concat(delays);
  }
  return Math.max(...durations.map((d, i) => toMs(d) + toMs(delays[i])));
}
function toMs(s) {
  if (s === "auto") return 0;
  return Number(s.slice(0, -1).replace(",", ".")) * 1e3;
}
function forceReflow(el) {
  const targetDocument = el ? el.ownerDocument : document;
  return targetDocument.body.offsetHeight;
}
function patchClass(el, value, isSVG) {
  const transitionClasses = el[vtcKey];
  if (transitionClasses) {
    value = (value ? [value, ...transitionClasses] : [...transitionClasses]).join(" ");
  }
  if (value == null) {
    el.removeAttribute("class");
  } else if (isSVG) {
    el.setAttribute("class", value);
  } else {
    el.className = value;
  }
}
const vShowOriginalDisplay = /* @__PURE__ */ Symbol("_vod");
const vShowHidden = /* @__PURE__ */ Symbol("_vsh");
const vShow = {
  // used for prop mismatch check during hydration
  name: "show",
  beforeMount(el, { value }, { transition }) {
    el[vShowOriginalDisplay] = el.style.display === "none" ? "" : el.style.display;
    if (transition && value) {
      transition.beforeEnter(el);
    } else {
      setDisplay(el, value);
    }
  },
  mounted(el, { value }, { transition }) {
    if (transition && value) {
      transition.enter(el);
    }
  },
  updated(el, { value, oldValue }, { transition }) {
    if (!value === !oldValue) return;
    if (transition) {
      if (value) {
        transition.beforeEnter(el);
        setDisplay(el, true);
        transition.enter(el);
      } else {
        transition.leave(el, () => {
          setDisplay(el, false);
        });
      }
    } else {
      setDisplay(el, value);
    }
  },
  beforeUnmount(el, { value }) {
    setDisplay(el, value);
  }
};
function setDisplay(el, value) {
  el.style.display = value ? el[vShowOriginalDisplay] : "none";
  el[vShowHidden] = !value;
}
function initVShowForSSR() {
  vShow.getSSRProps = ({ value }) => {
    if (!value) {
      return { style: { display: "none" } };
    }
  };
}
const CSS_VAR_TEXT = /* @__PURE__ */ Symbol("");
function useCssVars(getter) {
  const instance = getCurrentInstance();
  if (!instance) {
    return;
  }
  const updateTeleports = instance.ut = (vars = getter(instance.proxy)) => {
    Array.from(
      document.querySelectorAll(`[data-v-owner="${instance.uid}"]`)
    ).forEach((node) => setVarsOnNode(node, vars));
  };
  const setVars = () => {
    const vars = getter(instance.proxy);
    if (instance.ce) {
      setVarsOnNode(instance.ce, vars);
    } else {
      setVarsOnVNode(instance.subTree, vars);
    }
    updateTeleports(vars);
  };
  onBeforeUpdate(() => {
    queuePostFlushCb(setVars);
  });
  onMounted(() => {
    watch(setVars, NOOP, { flush: "post" });
    const ob = new MutationObserver(setVars);
    ob.observe(instance.subTree.el.parentNode, { childList: true });
    onUnmounted(() => ob.disconnect());
  });
}
function setVarsOnVNode(vnode, vars) {
  if (vnode.shapeFlag & 128) {
    const suspense = vnode.suspense;
    vnode = suspense.activeBranch;
    if (suspense.pendingBranch && !suspense.isHydrating) {
      suspense.effects.push(() => {
        setVarsOnVNode(suspense.activeBranch, vars);
      });
    }
  }
  while (vnode.component) {
    vnode = vnode.component.subTree;
  }
  if (vnode.shapeFlag & 1 && vnode.el) {
    setVarsOnNode(vnode.el, vars);
  } else if (vnode.type === Fragment) {
    vnode.children.forEach((c) => setVarsOnVNode(c, vars));
  } else if (vnode.type === Static) {
    let { el, anchor } = vnode;
    while (el) {
      setVarsOnNode(el, vars);
      if (el === anchor) break;
      el = el.nextSibling;
    }
  }
}
function setVarsOnNode(el, vars) {
  if (el.nodeType === 1) {
    const style = el.style;
    let cssText = "";
    for (const key in vars) {
      const value = normalizeCssVarValue(vars[key]);
      style.setProperty(`--${key}`, value);
      cssText += `--${key}: ${value};`;
    }
    style[CSS_VAR_TEXT] = cssText;
  }
}
const displayRE = /(?:^|;)\s*display\s*:/;
function patchStyle(el, prev, next) {
  const style = el.style;
  const isCssString = isString(next);
  let hasControlledDisplay = false;
  if (next && !isCssString) {
    if (prev) {
      if (!isString(prev)) {
        for (const key in prev) {
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      } else {
        for (const prevStyle of prev.split(";")) {
          const key = prevStyle.slice(0, prevStyle.indexOf(":")).trim();
          if (next[key] == null) {
            setStyle(style, key, "");
          }
        }
      }
    }
    for (const key in next) {
      if (key === "display") {
        hasControlledDisplay = true;
      }
      const value = next[key];
      if (value != null) {
        if (!shouldPreserveTextareaResizeStyle(
          el,
          key,
          !isString(prev) && prev ? prev[key] : void 0,
          value
        )) {
          setStyle(style, key, value);
        }
      } else {
        setStyle(style, key, "");
      }
    }
  } else {
    if (isCssString) {
      if (prev !== next) {
        const cssVarText = style[CSS_VAR_TEXT];
        if (cssVarText) {
          next += ";" + cssVarText;
        }
        style.cssText = next;
        hasControlledDisplay = displayRE.test(next);
      }
    } else if (prev) {
      el.removeAttribute("style");
    }
  }
  if (vShowOriginalDisplay in el) {
    el[vShowOriginalDisplay] = hasControlledDisplay ? style.display : "";
    if (el[vShowHidden]) {
      style.display = "none";
    }
  }
}
const importantRE = /\s*!important$/;
function setStyle(style, name, val) {
  if (isArray(val)) {
    val.forEach((v) => setStyle(style, name, v));
  } else {
    if (val == null) val = "";
    if (name.startsWith("--")) {
      style.setProperty(name, val);
    } else {
      const prefixed = autoPrefix(style, name);
      if (importantRE.test(val)) {
        style.setProperty(
          hyphenate(prefixed),
          val.replace(importantRE, ""),
          "important"
        );
      } else {
        style[prefixed] = val;
      }
    }
  }
}
const prefixes = ["Webkit", "Moz", "ms"];
const prefixCache = {};
function autoPrefix(style, rawName) {
  const cached = prefixCache[rawName];
  if (cached) {
    return cached;
  }
  let name = camelize(rawName);
  if (name !== "filter" && name in style) {
    return prefixCache[rawName] = name;
  }
  name = capitalize(name);
  for (let i = 0; i < prefixes.length; i++) {
    const prefixed = prefixes[i] + name;
    if (prefixed in style) {
      return prefixCache[rawName] = prefixed;
    }
  }
  return rawName;
}
function shouldPreserveTextareaResizeStyle(el, key, prev, next) {
  return el.tagName === "TEXTAREA" && (key === "width" || key === "height") && isString(next) && prev === next;
}
const xlinkNS = "http://www.w3.org/1999/xlink";
function patchAttr(el, key, value, isSVG, instance, isBoolean = isSpecialBooleanAttr(key)) {
  if (isSVG && key.startsWith("xlink:")) {
    if (value == null) {
      el.removeAttributeNS(xlinkNS, key.slice(6, key.length));
    } else {
      el.setAttributeNS(xlinkNS, key, value);
    }
  } else {
    if (value == null || isBoolean && !includeBooleanAttr(value)) {
      el.removeAttribute(key);
    } else {
      el.setAttribute(
        key,
        isBoolean ? "" : isSymbol(value) ? String(value) : value
      );
    }
  }
}
function patchDOMProp(el, key, value, parentComponent, attrName) {
  if (key === "innerHTML" || key === "textContent") {
    if (value != null) {
      el[key] = key === "innerHTML" ? unsafeToTrustedHTML(value) : value;
    }
    return;
  }
  const tag = el.tagName;
  if (key === "value" && tag !== "PROGRESS" && // custom elements may use _value internally
  !tag.includes("-")) {
    const oldValue = tag === "OPTION" ? el.getAttribute("value") || "" : el.value;
    const newValue = value == null ? (
      // #11647: value should be set as empty string for null and undefined,
      // but <input type="checkbox"> should be set as 'on'.
      el.type === "checkbox" ? "on" : ""
    ) : String(value);
    if (oldValue !== newValue || !("_value" in el)) {
      el.value = newValue;
    }
    if (value == null) {
      el.removeAttribute(key);
    }
    el._value = value;
    return;
  }
  let needRemove = false;
  if (value === "" || value == null) {
    const type = typeof el[key];
    if (type === "boolean") {
      value = includeBooleanAttr(value);
    } else if (value == null && type === "string") {
      value = "";
      needRemove = true;
    } else if (type === "number") {
      value = 0;
      needRemove = true;
    }
  }
  try {
    el[key] = value;
  } catch (e) {
  }
  needRemove && el.removeAttribute(attrName || key);
}
function addEventListener(el, event, handler, options) {
  el.addEventListener(event, handler, options);
}
function removeEventListener(el, event, handler, options) {
  el.removeEventListener(event, handler, options);
}
const veiKey = /* @__PURE__ */ Symbol("_vei");
function patchEvent(el, rawName, prevValue, nextValue, instance = null) {
  const invokers = el[veiKey] || (el[veiKey] = {});
  const existingInvoker = invokers[rawName];
  if (nextValue && existingInvoker) {
    existingInvoker.value = nextValue;
  } else {
    const [name, options] = parseName(rawName);
    if (nextValue) {
      const invoker = invokers[rawName] = createInvoker(
        nextValue,
        instance
      );
      addEventListener(el, name, invoker, options);
    } else if (existingInvoker) {
      removeEventListener(el, name, existingInvoker, options);
      invokers[rawName] = void 0;
    }
  }
}
const optionsModifierRE = /(Once|Passive|Capture)$/;
const optionsModifierEventRE = /^on:?(?:Once|Passive|Capture)$/;
function parseName(name) {
  let options;
  let m;
  while ((m = name.match(optionsModifierRE)) && !optionsModifierEventRE.test(name)) {
    if (!options) options = {};
    name = name.slice(0, name.length - m[1].length);
    options[m[1].toLowerCase()] = true;
  }
  const event = name[2] === ":" ? name.slice(3) : hyphenate(name.slice(2));
  return [event, options];
}
let cachedNow = 0;
const p = /* @__PURE__ */ Promise.resolve();
const getNow = () => cachedNow || (p.then(() => cachedNow = 0), cachedNow = Date.now());
function createInvoker(initialValue, instance) {
  const invoker = (e) => {
    if (!e._vts) {
      e._vts = Date.now();
    } else if (e._vts <= invoker.attached) {
      return;
    }
    const value = invoker.value;
    if (isArray(value)) {
      const originalStop = e.stopImmediatePropagation;
      e.stopImmediatePropagation = () => {
        originalStop.call(e);
        e._stopped = true;
      };
      const handlers2 = value.slice();
      const args = [e];
      for (let i = 0; i < handlers2.length; i++) {
        if (e._stopped) {
          break;
        }
        const handler = handlers2[i];
        if (handler) {
          callWithAsyncErrorHandling(
            handler,
            instance,
            5,
            args
          );
        }
      }
    } else {
      callWithAsyncErrorHandling(
        value,
        instance,
        5,
        [e]
      );
    }
  };
  invoker.value = initialValue;
  invoker.attached = getNow();
  return invoker;
}
const isNativeOn = (key) => key.charCodeAt(0) === 111 && key.charCodeAt(1) === 110 && // lowercase letter
key.charCodeAt(2) > 96 && key.charCodeAt(2) < 123;
const patchProp = (el, key, prevValue, nextValue, namespace, parentComponent) => {
  const isSVG = namespace === "svg";
  if (key === "class") {
    patchClass(el, nextValue, isSVG);
  } else if (key === "style") {
    patchStyle(el, prevValue, nextValue);
  } else if (isOn(key)) {
    if (!isModelListener(key)) {
      patchEvent(el, key, prevValue, nextValue, parentComponent);
    }
  } else if (key[0] === "." ? (key = key.slice(1), true) : key[0] === "^" ? (key = key.slice(1), false) : shouldSetAsProp(el, key, nextValue, isSVG)) {
    patchDOMProp(el, key, nextValue);
    if (!el.tagName.includes("-") && (key === "value" || key === "checked" || key === "selected")) {
      patchAttr(el, key, nextValue, isSVG, parentComponent, key !== "value");
    }
  } else if (
    // #11081 force set props for possible async custom element
    el._isVueCE && // #12408 check if it's declared prop or it's async custom element
    (shouldSetAsPropForVueCE(el, key) || // @ts-expect-error _def is private
    el._def.__asyncLoader && (/[A-Z]/.test(key) || !isString(nextValue)))
  ) {
    patchDOMProp(el, camelize(key), nextValue, parentComponent, key);
  } else {
    if (key === "true-value") {
      el._trueValue = nextValue;
    } else if (key === "false-value") {
      el._falseValue = nextValue;
    }
    patchAttr(el, key, nextValue, isSVG);
  }
};
function shouldSetAsProp(el, key, value, isSVG) {
  if (isSVG) {
    if (key === "innerHTML" || key === "textContent") {
      return true;
    }
    if (key in el && isNativeOn(key) && isFunction(value)) {
      return true;
    }
    return false;
  }
  if (key === "spellcheck" || key === "draggable" || key === "translate" || key === "autocorrect") {
    return false;
  }
  if (key === "sandbox" && el.tagName === "IFRAME") {
    return false;
  }
  if (key === "form") {
    return false;
  }
  if (key === "list" && el.tagName === "INPUT") {
    return false;
  }
  if (key === "type" && el.tagName === "TEXTAREA") {
    return false;
  }
  if (key === "width" || key === "height") {
    const tag = el.tagName;
    if (tag === "IMG" || tag === "VIDEO" || tag === "CANVAS" || tag === "SOURCE") {
      return false;
    }
  }
  if (isNativeOn(key) && isString(value)) {
    return false;
  }
  return key in el;
}
function shouldSetAsPropForVueCE(el, key) {
  const props = (
    // @ts-expect-error _def is private
    el._def.props
  );
  if (!props) {
    return false;
  }
  const camelKey = camelize(key);
  return Array.isArray(props) ? props.some((prop) => camelize(prop) === camelKey) : Object.keys(props).some((prop) => camelize(prop) === camelKey);
}
const REMOVAL = {};
// @__NO_SIDE_EFFECTS__
function defineCustomElement(options, extraOptions, _createApp) {
  let Comp = /* @__PURE__ */ defineComponent(options, extraOptions);
  if (isPlainObject$1(Comp)) Comp = extend({}, Comp, extraOptions);
  class VueCustomElement extends VueElement {
    constructor(initialProps) {
      super(Comp, initialProps, _createApp);
    }
  }
  VueCustomElement.def = Comp;
  return VueCustomElement;
}
const defineSSRCustomElement = (/* @__NO_SIDE_EFFECTS__ */ (options, extraOptions) => {
  return /* @__PURE__ */ defineCustomElement(options, extraOptions, createSSRApp);
});
const BaseClass = typeof HTMLElement !== "undefined" ? HTMLElement : class {
};
class VueElement extends BaseClass {
  constructor(_def, _props = {}, _createApp = createApp) {
    super();
    this._def = _def;
    this._props = _props;
    this._createApp = _createApp;
    this._isVueCE = true;
    this._instance = null;
    this._app = null;
    this._nonce = this._def.nonce;
    this._connected = false;
    this._resolved = false;
    this._patching = false;
    this._dirty = false;
    this._numberProps = null;
    this._styleChildren = /* @__PURE__ */ new WeakSet();
    this._styleAnchors = /* @__PURE__ */ new WeakMap();
    this._ob = null;
    if (this.shadowRoot && _createApp !== createApp) {
      this._root = this.shadowRoot;
    } else {
      if (_def.shadowRoot !== false) {
        this.attachShadow(
          extend({}, _def.shadowRootOptions, {
            mode: "open"
          })
        );
        this._root = this.shadowRoot;
      } else {
        this._root = this;
      }
    }
  }
  connectedCallback() {
    if (!this.isConnected) return;
    if (!this.shadowRoot && !this._resolved) {
      this._parseSlots();
    }
    this._connected = true;
    let parent = this;
    while (parent = parent && // #12479 should check assignedSlot first to get correct parent
    (parent.assignedSlot || parent.parentNode || parent.host)) {
      if (parent instanceof VueElement) {
        this._parent = parent;
        break;
      }
    }
    if (!this._instance) {
      if (this._resolved) {
        this._mount(this._def);
      } else {
        if (parent && parent._pendingResolve) {
          this._pendingResolve = parent._pendingResolve.then(() => {
            this._pendingResolve = void 0;
            this._resolveDef();
          });
        } else {
          this._resolveDef();
        }
      }
    }
  }
  _setParent(parent = this._parent) {
    if (parent) {
      this._instance.parent = parent._instance;
      this._inheritParentContext(parent);
    }
  }
  _inheritParentContext(parent = this._parent) {
    if (parent && this._app) {
      Object.setPrototypeOf(
        this._app._context.provides,
        parent._instance.provides
      );
    }
  }
  disconnectedCallback() {
    this._connected = false;
    nextTick(() => {
      if (!this._connected) {
        if (this._ob) {
          this._ob.disconnect();
          this._ob = null;
        }
        this._app && this._app.unmount();
        if (this._instance) this._instance.ce = void 0;
        this._app = this._instance = null;
        if (this._teleportTargets) {
          this._teleportTargets.clear();
          this._teleportTargets = void 0;
        }
      }
    });
  }
  _processMutations(mutations) {
    for (const m of mutations) {
      this._setAttr(m.attributeName);
    }
  }
  /**
   * resolve inner component definition (handle possible async component)
   */
  _resolveDef() {
    if (this._pendingResolve) {
      return;
    }
    for (let i = 0; i < this.attributes.length; i++) {
      this._setAttr(this.attributes[i].name);
    }
    this._ob = new MutationObserver(this._processMutations.bind(this));
    this._ob.observe(this, { attributes: true });
    const resolve2 = (def2, isAsync = false) => {
      this._resolved = true;
      this._pendingResolve = void 0;
      const { props, styles } = def2;
      let numberProps;
      if (props && !isArray(props)) {
        for (const key in props) {
          const opt = props[key];
          if (opt === Number || opt && opt.type === Number) {
            if (key in this._props) {
              this._props[key] = toNumber(this._props[key]);
            }
            (numberProps || (numberProps = /* @__PURE__ */ Object.create(null)))[camelize(key)] = true;
          }
        }
      }
      this._numberProps = numberProps;
      this._resolveProps(def2);
      if (this.shadowRoot) {
        this._applyStyles(styles);
      }
      this._mount(def2);
    };
    const asyncDef = this._def.__asyncLoader;
    if (asyncDef) {
      this._pendingResolve = asyncDef().then((def2) => {
        def2.configureApp = this._def.configureApp;
        resolve2(this._def = def2, true);
      });
    } else {
      resolve2(this._def);
    }
  }
  _mount(def2) {
    this._app = this._createApp(def2);
    this._inheritParentContext();
    if (def2.configureApp) {
      def2.configureApp(this._app);
    }
    this._app._ceVNode = this._createVNode();
    this._app.mount(this._root);
    const exposed = this._instance && this._instance.exposed;
    if (!exposed) return;
    for (const key in exposed) {
      if (!hasOwn(this, key)) {
        Object.defineProperty(this, key, {
          // unwrap ref to be consistent with public instance behavior
          get: () => unref(exposed[key])
        });
      }
    }
  }
  _resolveProps(def2) {
    const { props } = def2;
    const declaredPropKeys = isArray(props) ? props : Object.keys(props || {});
    for (const key of Object.keys(this)) {
      if (key[0] !== "_" && declaredPropKeys.includes(key)) {
        this._setProp(key, this[key]);
      }
    }
    for (const key of declaredPropKeys.map(camelize)) {
      Object.defineProperty(this, key, {
        get() {
          return this._getProp(key);
        },
        set(val) {
          this._setProp(key, val, true, !this._patching);
        }
      });
    }
  }
  _setAttr(key) {
    if (key.startsWith("data-v-")) return;
    const has = this.hasAttribute(key);
    let value = has ? this.getAttribute(key) : REMOVAL;
    const camelKey = camelize(key);
    if (has && this._numberProps && this._numberProps[camelKey]) {
      value = toNumber(value);
    }
    this._setProp(camelKey, value, false, true);
  }
  /**
   * @internal
   */
  _getProp(key) {
    return this._props[key];
  }
  /**
   * @internal
   */
  _setProp(key, val, shouldReflect = true, shouldUpdate = false) {
    if (val !== this._props[key]) {
      this._dirty = true;
      if (val === REMOVAL) {
        delete this._props[key];
      } else {
        this._props[key] = val;
        if (key === "key" && this._app) {
          this._app._ceVNode.key = val;
        }
      }
      if (shouldUpdate && this._instance) {
        this._update();
      }
      if (shouldReflect) {
        const ob = this._ob;
        if (ob) {
          this._processMutations(ob.takeRecords());
          ob.disconnect();
        }
        if (val === true) {
          this.setAttribute(hyphenate(key), "");
        } else if (typeof val === "string" || typeof val === "number") {
          this.setAttribute(hyphenate(key), val + "");
        } else if (!val) {
          this.removeAttribute(hyphenate(key));
        }
        ob && ob.observe(this, { attributes: true });
      }
    }
  }
  _update() {
    const vnode = this._createVNode();
    if (this._app) vnode.appContext = this._app._context;
    render(vnode, this._root);
  }
  _createVNode() {
    const baseProps = {};
    if (!this.shadowRoot) {
      baseProps.onVnodeMounted = baseProps.onVnodeUpdated = this._renderSlots.bind(this);
    }
    const vnode = createVNode(this._def, extend(baseProps, this._props));
    if (!this._instance) {
      vnode.ce = (instance) => {
        this._instance = instance;
        instance.ce = this;
        instance.isCE = true;
        const dispatch = (event, args) => {
          this.dispatchEvent(
            new CustomEvent(
              event,
              isPlainObject$1(args[0]) ? extend({ detail: args }, args[0]) : { detail: args }
            )
          );
        };
        instance.emit = (event, ...args) => {
          dispatch(event, args);
          if (hyphenate(event) !== event) {
            dispatch(hyphenate(event), args);
          }
        };
        this._setParent();
      };
    }
    return vnode;
  }
  _applyStyles(styles, owner, parentComp) {
    if (!styles) return;
    if (owner) {
      if (owner === this._def || this._styleChildren.has(owner)) {
        return;
      }
      this._styleChildren.add(owner);
    }
    const nonce = this._nonce;
    const root = this.shadowRoot;
    const insertionAnchor = parentComp ? this._getStyleAnchor(parentComp) || this._getStyleAnchor(this._def) : this._getRootStyleInsertionAnchor(root);
    let last = null;
    for (let i = styles.length - 1; i >= 0; i--) {
      const s = document.createElement("style");
      if (nonce) s.setAttribute("nonce", nonce);
      s.textContent = styles[i];
      root.insertBefore(s, last || insertionAnchor);
      last = s;
      if (i === 0) {
        if (!parentComp) this._styleAnchors.set(this._def, s);
        if (owner) this._styleAnchors.set(owner, s);
      }
    }
  }
  _getStyleAnchor(comp) {
    if (!comp) {
      return null;
    }
    const anchor = this._styleAnchors.get(comp);
    if (anchor && anchor.parentNode === this.shadowRoot) {
      return anchor;
    }
    if (anchor) {
      this._styleAnchors.delete(comp);
    }
    return null;
  }
  _getRootStyleInsertionAnchor(root) {
    for (let i = 0; i < root.childNodes.length; i++) {
      const node = root.childNodes[i];
      if (!(node instanceof HTMLStyleElement)) {
        return node;
      }
    }
    return null;
  }
  /**
   * Only called when shadowRoot is false
   */
  _parseSlots() {
    const slots = this._slots = {};
    let n;
    while (n = this.firstChild) {
      const slotName = n.nodeType === 1 && n.getAttribute("slot") || "default";
      (slots[slotName] || (slots[slotName] = [])).push(n);
      this.removeChild(n);
    }
  }
  /**
   * Only called when shadowRoot is false
   */
  _renderSlots() {
    const outlets = this._getSlots();
    const scopeId = this._instance.type.__scopeId;
    for (let i = 0; i < outlets.length; i++) {
      const o = outlets[i];
      const slotName = o.getAttribute("name") || "default";
      const content = this._slots[slotName];
      const parent = o.parentNode;
      if (content) {
        for (const n of content) {
          if (scopeId && n.nodeType === 1) {
            const id = scopeId + "-s";
            const walker = document.createTreeWalker(n, 1);
            n.setAttribute(id, "");
            let child;
            while (child = walker.nextNode()) {
              child.setAttribute(id, "");
            }
          }
          parent.insertBefore(n, o);
        }
      } else {
        while (o.firstChild) parent.insertBefore(o.firstChild, o);
      }
      parent.removeChild(o);
    }
  }
  /**
   * @internal
   */
  _getSlots() {
    const roots = [this];
    if (this._teleportTargets) {
      roots.push(...this._teleportTargets);
    }
    const slots = /* @__PURE__ */ new Set();
    for (const root of roots) {
      const found = root.querySelectorAll("slot");
      for (let i = 0; i < found.length; i++) {
        slots.add(found[i]);
      }
    }
    return Array.from(slots);
  }
  /**
   * @internal
   */
  _injectChildStyle(comp, parentComp) {
    this._applyStyles(comp.styles, comp, parentComp);
  }
  /**
   * @internal
   */
  _beginPatch() {
    this._patching = true;
    this._dirty = false;
  }
  /**
   * @internal
   */
  _endPatch() {
    this._patching = false;
    if (this._dirty && this._instance) {
      this._update();
    }
  }
  /**
   * @internal
   */
  _hasShadowRoot() {
    return this._def.shadowRoot !== false;
  }
  /**
   * @internal
   */
  _removeChildStyle(comp) {
  }
}
function useHost(caller) {
  const instance = getCurrentInstance();
  const el = instance && instance.ce;
  if (el) {
    return el;
  }
  return null;
}
function useShadowRoot() {
  const el = useHost();
  return el && el.shadowRoot;
}
function useCssModule(name = "$style") {
  {
    const instance = getCurrentInstance();
    if (!instance) {
      return EMPTY_OBJ;
    }
    const modules = instance.type.__cssModules;
    if (!modules) {
      return EMPTY_OBJ;
    }
    const mod = modules[name];
    if (!mod) {
      return EMPTY_OBJ;
    }
    return mod;
  }
}
const positionMap = /* @__PURE__ */ new WeakMap();
const newPositionMap = /* @__PURE__ */ new WeakMap();
const moveCbKey = /* @__PURE__ */ Symbol("_moveCb");
const enterCbKey = /* @__PURE__ */ Symbol("_enterCb");
const decorate = (t) => {
  delete t.props.mode;
  return t;
};
const TransitionGroupImpl = /* @__PURE__ */ decorate({
  name: "TransitionGroup",
  props: /* @__PURE__ */ extend({}, TransitionPropsValidators, {
    tag: String,
    moveClass: String
  }),
  setup(props, { slots }) {
    const instance = getCurrentInstance();
    const state = useTransitionState();
    let prevChildren;
    let children;
    onUpdated(() => {
      if (!prevChildren.length) {
        return;
      }
      const moveClass = props.moveClass || `${props.name || "v"}-move`;
      if (!hasCSSTransform(
        prevChildren[0].el,
        instance.vnode.el,
        moveClass
      )) {
        prevChildren = [];
        return;
      }
      prevChildren.forEach(callPendingCbs);
      prevChildren.forEach(recordPosition);
      const movedChildren = prevChildren.filter(applyTranslation);
      forceReflow(instance.vnode.el);
      movedChildren.forEach((c) => {
        const el = c.el;
        const style = el.style;
        addTransitionClass(el, moveClass);
        style.transform = style.webkitTransform = style.transitionDuration = "";
        const cb = el[moveCbKey] = (e) => {
          if (e && e.target !== el) {
            return;
          }
          if (!e || e.propertyName.endsWith("transform")) {
            el.removeEventListener("transitionend", cb);
            el[moveCbKey] = null;
            removeTransitionClass(el, moveClass);
          }
        };
        el.addEventListener("transitionend", cb);
      });
      prevChildren = [];
    });
    return () => {
      const rawProps = /* @__PURE__ */ toRaw(props);
      const cssTransitionProps = resolveTransitionProps(rawProps);
      let tag = rawProps.tag || Fragment;
      prevChildren = [];
      if (children) {
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          if (child.el && child.el instanceof Element && // Hidden v-show nodes have no previous layout box to animate from.
          !child.el[vShowHidden]) {
            prevChildren.push(child);
            setTransitionHooks(
              child,
              resolveTransitionHooks(
                child,
                cssTransitionProps,
                state,
                instance
              )
            );
            positionMap.set(child, getPosition(child.el));
          }
        }
      }
      children = slots.default ? getTransitionRawChildren(slots.default()) : [];
      for (let i = 0; i < children.length; i++) {
        const child = children[i];
        if (child.key != null) {
          setTransitionHooks(
            child,
            resolveTransitionHooks(child, cssTransitionProps, state, instance)
          );
        }
      }
      return createVNode(tag, null, children);
    };
  }
});
const TransitionGroup = TransitionGroupImpl;
function callPendingCbs(c) {
  const el = c.el;
  if (el[moveCbKey]) {
    el[moveCbKey]();
  }
  if (el[enterCbKey]) {
    el[enterCbKey]();
  }
}
function recordPosition(c) {
  newPositionMap.set(c, getPosition(c.el));
}
function applyTranslation(c) {
  const oldPos = positionMap.get(c);
  const newPos = newPositionMap.get(c);
  const dx = oldPos.left - newPos.left;
  const dy = oldPos.top - newPos.top;
  if (dx || dy) {
    const el = c.el;
    const s = el.style;
    const rect = el.getBoundingClientRect();
    let scaleX = 1;
    let scaleY = 1;
    if (el.offsetWidth) scaleX = rect.width / el.offsetWidth;
    if (el.offsetHeight) scaleY = rect.height / el.offsetHeight;
    if (!Number.isFinite(scaleX) || scaleX === 0) scaleX = 1;
    if (!Number.isFinite(scaleY) || scaleY === 0) scaleY = 1;
    if (Math.abs(scaleX - 1) < 0.01) scaleX = 1;
    if (Math.abs(scaleY - 1) < 0.01) scaleY = 1;
    s.transform = s.webkitTransform = `translate(${dx / scaleX}px,${dy / scaleY}px)`;
    s.transitionDuration = "0s";
    return c;
  }
}
function getPosition(el) {
  const rect = el.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top
  };
}
function hasCSSTransform(el, root, moveClass) {
  const clone = el.cloneNode();
  const _vtc = el[vtcKey];
  if (_vtc) {
    _vtc.forEach((cls) => {
      cls.split(/\s+/).forEach((c) => c && clone.classList.remove(c));
    });
  }
  moveClass.split(/\s+/).forEach((c) => c && clone.classList.add(c));
  clone.style.display = "none";
  const container = root.nodeType === 1 ? root : root.parentNode;
  container.appendChild(clone);
  const { hasTransform } = getTransitionInfo(clone);
  container.removeChild(clone);
  return hasTransform;
}
const getModelAssigner = (vnode) => {
  const fn = vnode.props["onUpdate:modelValue"] || false;
  return isArray(fn) ? (value) => invokeArrayFns(fn, value) : fn;
};
function onCompositionStart(e) {
  e.target.composing = true;
}
function onCompositionEnd(e) {
  const target = e.target;
  if (target.composing) {
    target.composing = false;
    target.dispatchEvent(new Event("input"));
  }
}
const assignKey = /* @__PURE__ */ Symbol("_assign");
function castValue(value, trim, number) {
  if (trim) value = value.trim();
  if (number) value = looseToNumber(value);
  return value;
}
const vModelText = {
  created(el, { modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    const castToNumber = number || vnode.props && vnode.props.type === "number";
    addEventListener(el, lazy ? "change" : "input", (e) => {
      if (e.target.composing) return;
      el[assignKey](castValue(el.value, trim, castToNumber));
    });
    if (trim || castToNumber) {
      addEventListener(el, "change", () => {
        el.value = castValue(el.value, trim, castToNumber);
      });
    }
    if (!lazy) {
      addEventListener(el, "compositionstart", onCompositionStart);
      addEventListener(el, "compositionend", onCompositionEnd);
      addEventListener(el, "change", onCompositionEnd);
    }
  },
  // set value on mounted so it's after min/max for type="range"
  mounted(el, { value }) {
    el.value = value == null ? "" : value;
  },
  beforeUpdate(el, { value, oldValue, modifiers: { lazy, trim, number } }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    if (el.composing) return;
    const elValue = (number || el.type === "number") && !/^0\d/.test(el.value) ? looseToNumber(el.value) : el.value;
    const newValue = value == null ? "" : value;
    if (elValue === newValue) {
      return;
    }
    const rootNode = el.getRootNode();
    if ((rootNode instanceof Document || rootNode instanceof ShadowRoot) && rootNode.activeElement === el && el.type !== "range") {
      if (lazy && value === oldValue) {
        return;
      }
      if (trim && el.value.trim() === newValue) {
        return;
      }
    }
    el.value = newValue;
  }
};
const vModelCheckbox = {
  // #4096 array checkboxes need to be deep traversed
  deep: true,
  created(el, _, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    addEventListener(el, "change", () => {
      const modelValue = el._modelValue;
      const elementValue = getValue(el);
      const checked = el.checked;
      const assign2 = el[assignKey];
      if (isArray(modelValue)) {
        const index = looseIndexOf(modelValue, elementValue);
        const found = index !== -1;
        if (checked && !found) {
          assign2(modelValue.concat(elementValue));
        } else if (!checked && found) {
          const filtered = [...modelValue];
          filtered.splice(index, 1);
          assign2(filtered);
        }
      } else if (isSet(modelValue)) {
        const cloned = new Set(modelValue);
        if (checked) {
          cloned.add(elementValue);
        } else {
          cloned.delete(elementValue);
        }
        assign2(cloned);
      } else {
        assign2(getCheckboxValue(el, checked));
      }
    });
  },
  // set initial checked on mount to wait for true-value/false-value
  mounted: setChecked,
  beforeUpdate(el, binding, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    setChecked(el, binding, vnode);
  }
};
function setChecked(el, { value, oldValue }, vnode) {
  el._modelValue = value;
  let checked;
  if (isArray(value)) {
    checked = looseIndexOf(value, vnode.props.value) > -1;
  } else if (isSet(value)) {
    checked = value.has(vnode.props.value);
  } else {
    if (value === oldValue) return;
    checked = looseEqual(value, getCheckboxValue(el, true));
  }
  if (el.checked !== checked) {
    el.checked = checked;
  }
}
const vModelRadio = {
  created(el, { value }, vnode) {
    el.checked = looseEqual(value, vnode.props.value);
    el[assignKey] = getModelAssigner(vnode);
    addEventListener(el, "change", () => {
      el[assignKey](getValue(el));
    });
  },
  beforeUpdate(el, { value, oldValue }, vnode) {
    el[assignKey] = getModelAssigner(vnode);
    if (value !== oldValue) {
      el.checked = looseEqual(value, vnode.props.value);
    }
  }
};
const vModelSelect = {
  // <select multiple> value need to be deep traversed
  deep: true,
  created(el, { value, modifiers: { number } }, vnode) {
    el._modelValue = value;
    addEventListener(el, "change", () => {
      const selectedVal = Array.prototype.filter.call(el.options, (o) => o.selected).map(
        (o) => number ? looseToNumber(getValue(o)) : getValue(o)
      );
      el[assignKey](
        el.multiple ? isSet(el._modelValue) ? new Set(selectedVal) : selectedVal : selectedVal[0]
      );
      el._assigning = true;
      nextTick(() => {
        el._assigning = false;
      });
    });
    el[assignKey] = getModelAssigner(vnode);
  },
  // set value in mounted & updated because <select> relies on its children
  // <option>s.
  mounted(el, { value }) {
    setSelected(el, value);
  },
  beforeUpdate(el, { value }, vnode) {
    el._modelValue = value;
    el[assignKey] = getModelAssigner(vnode);
  },
  updated(el, { value }) {
    if (!el._assigning) {
      setSelected(el, value);
    }
  }
};
function setSelected(el, value) {
  const isMultiple = el.multiple;
  const isArrayValue = isArray(value);
  if (isMultiple && !isArrayValue && !isSet(value)) {
    return;
  }
  for (let i = 0, l = el.options.length; i < l; i++) {
    const option = el.options[i];
    const optionValue = getValue(option);
    if (isMultiple) {
      if (isArrayValue) {
        const optionType = typeof optionValue;
        if (optionType === "string" || optionType === "number") {
          option.selected = value.some((v) => String(v) === String(optionValue));
        } else {
          option.selected = looseIndexOf(value, optionValue) > -1;
        }
      } else {
        option.selected = value.has(optionValue);
      }
    } else if (looseEqual(getValue(option), value)) {
      if (el.selectedIndex !== i) el.selectedIndex = i;
      return;
    }
  }
  if (!isMultiple && el.selectedIndex !== -1) {
    el.selectedIndex = -1;
  }
}
function getValue(el) {
  return "_value" in el ? el._value : el.value;
}
function getCheckboxValue(el, checked) {
  const key = checked ? "_trueValue" : "_falseValue";
  return key in el ? el[key] : checked;
}
const vModelDynamic = {
  created(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, "created");
  },
  mounted(el, binding, vnode) {
    callModelHook(el, binding, vnode, null, "mounted");
  },
  beforeUpdate(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, "beforeUpdate");
  },
  updated(el, binding, vnode, prevVNode) {
    callModelHook(el, binding, vnode, prevVNode, "updated");
  }
};
function resolveDynamicModel(tagName, type) {
  switch (tagName) {
    case "SELECT":
      return vModelSelect;
    case "TEXTAREA":
      return vModelText;
    default:
      switch (type) {
        case "checkbox":
          return vModelCheckbox;
        case "radio":
          return vModelRadio;
        default:
          return vModelText;
      }
  }
}
function callModelHook(el, binding, vnode, prevVNode, hook) {
  const modelToUse = resolveDynamicModel(
    el.tagName,
    vnode.props && vnode.props.type
  );
  const fn = modelToUse[hook];
  fn && fn(el, binding, vnode, prevVNode);
}
function initVModelForSSR() {
  vModelText.getSSRProps = ({ value }) => ({ value });
  vModelRadio.getSSRProps = ({ value }, vnode) => {
    if (vnode.props && looseEqual(vnode.props.value, value)) {
      return { checked: true };
    }
  };
  vModelCheckbox.getSSRProps = ({ value }, vnode) => {
    if (isArray(value)) {
      if (vnode.props && looseIndexOf(value, vnode.props.value) > -1) {
        return { checked: true };
      }
    } else if (isSet(value)) {
      if (vnode.props && value.has(vnode.props.value)) {
        return { checked: true };
      }
    } else if (value) {
      return { checked: true };
    }
  };
  vModelDynamic.getSSRProps = (binding, vnode) => {
    if (typeof vnode.type !== "string") {
      return;
    }
    const modelToUse = resolveDynamicModel(
      // resolveDynamicModel expects an uppercase tag name, but vnode.type is lowercase
      vnode.type.toUpperCase(),
      vnode.props && vnode.props.type
    );
    if (modelToUse.getSSRProps) {
      return modelToUse.getSSRProps(binding, vnode);
    }
  };
}
const systemModifiers = ["ctrl", "shift", "alt", "meta"];
const modifierGuards = {
  stop: (e) => e.stopPropagation(),
  prevent: (e) => e.preventDefault(),
  self: (e) => e.target !== e.currentTarget,
  ctrl: (e) => !e.ctrlKey,
  shift: (e) => !e.shiftKey,
  alt: (e) => !e.altKey,
  meta: (e) => !e.metaKey,
  left: (e) => "button" in e && e.button !== 0,
  middle: (e) => "button" in e && e.button !== 1,
  right: (e) => "button" in e && e.button !== 2,
  exact: (e, modifiers) => systemModifiers.some((m) => e[`${m}Key`] && !modifiers.includes(m))
};
const withModifiers = (fn, modifiers) => {
  if (!fn) return fn;
  const cache = fn._withMods || (fn._withMods = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = ((event, ...args) => {
    for (let i = 0; i < modifiers.length; i++) {
      const guard = modifierGuards[modifiers[i]];
      if (guard && guard(event, modifiers)) return;
    }
    return fn(event, ...args);
  }));
};
const keyNames = {
  esc: "escape",
  space: " ",
  up: "arrow-up",
  left: "arrow-left",
  right: "arrow-right",
  down: "arrow-down",
  delete: "backspace"
};
const withKeys = (fn, modifiers) => {
  const cache = fn._withKeys || (fn._withKeys = {});
  const cacheKey = modifiers.join(".");
  return cache[cacheKey] || (cache[cacheKey] = ((event) => {
    if (!("key" in event)) {
      return;
    }
    const eventKey = hyphenate(event.key);
    if (modifiers.some(
      (k) => k === eventKey || keyNames[k] === eventKey
    )) {
      return fn(event);
    }
  }));
};
const rendererOptions = /* @__PURE__ */ extend({ patchProp }, nodeOps);
let renderer;
let enabledHydration = false;
function ensureRenderer() {
  return renderer || (renderer = createRenderer(rendererOptions));
}
function ensureHydrationRenderer() {
  renderer = enabledHydration ? renderer : createHydrationRenderer(rendererOptions);
  enabledHydration = true;
  return renderer;
}
const render = ((...args) => {
  ensureRenderer().render(...args);
});
const hydrate = ((...args) => {
  ensureHydrationRenderer().hydrate(...args);
});
const createApp = ((...args) => {
  const app = ensureRenderer().createApp(...args);
  const { mount } = app;
  app.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (!container) return;
    const component = app._component;
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML;
    }
    if (container.nodeType === 1) {
      container.textContent = "";
    }
    const proxy = mount(container, false, resolveRootNamespace(container));
    if (container instanceof Element) {
      container.removeAttribute("v-cloak");
      container.setAttribute("data-v-app", "");
    }
    return proxy;
  };
  return app;
});
const createSSRApp = ((...args) => {
  const app = ensureHydrationRenderer().createApp(...args);
  const { mount } = app;
  app.mount = (containerOrSelector) => {
    const container = normalizeContainer(containerOrSelector);
    if (container) {
      return mount(container, true, resolveRootNamespace(container));
    }
  };
  return app;
});
function resolveRootNamespace(container) {
  if (container instanceof SVGElement) {
    return "svg";
  }
  if (typeof MathMLElement === "function" && container instanceof MathMLElement) {
    return "mathml";
  }
}
function normalizeContainer(container) {
  if (isString(container)) {
    const res = document.querySelector(container);
    return res;
  }
  return container;
}
let ssrDirectiveInitialized = false;
const initDirectivesForSSR = () => {
  if (!ssrDirectiveInitialized) {
    ssrDirectiveInitialized = true;
    initVModelForSSR();
    initVShowForSSR();
  }
};
/**
* vue v3.5.40
* (c) 2018-present Yuxi (Evan) You and Vue contributors
* @license MIT
**/
const compile = () => {
};
const vue = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  BaseTransition,
  BaseTransitionPropsValidators,
  Comment,
  DeprecationTypes,
  EffectScope,
  ErrorCodes,
  ErrorTypeStrings,
  Fragment,
  KeepAlive,
  ReactiveEffect,
  Static,
  Suspense,
  Teleport,
  Text,
  TrackOpTypes,
  Transition,
  TransitionGroup,
  TriggerOpTypes,
  VueElement,
  assertNumber,
  callWithAsyncErrorHandling,
  callWithErrorHandling,
  camelize,
  capitalize,
  cloneVNode,
  compatUtils,
  compile,
  computed,
  createApp,
  createBlock,
  createCommentVNode,
  createElementBlock,
  createElementVNode: createBaseVNode,
  createHydrationRenderer,
  createPropsRestProxy,
  createRenderer,
  createSSRApp,
  createSlots,
  createStaticVNode,
  createTextVNode,
  createVNode,
  customRef,
  defineAsyncComponent,
  defineComponent,
  defineCustomElement,
  defineEmits,
  defineExpose,
  defineModel,
  defineOptions,
  defineProps,
  defineSSRCustomElement,
  defineSlots,
  devtools,
  effect,
  effectScope,
  getCurrentInstance,
  getCurrentScope,
  getCurrentWatcher,
  getTransitionRawChildren,
  guardReactiveProps,
  h,
  handleError,
  hasInjectionContext,
  hydrate,
  hydrateOnIdle,
  hydrateOnInteraction,
  hydrateOnMediaQuery,
  hydrateOnVisible,
  initCustomFormatter,
  initDirectivesForSSR,
  inject,
  isMemoSame,
  isProxy,
  isReactive,
  isReadonly,
  isRef,
  isRuntimeOnly,
  isShallow,
  isVNode,
  markRaw,
  mergeDefaults,
  mergeModels,
  mergeProps,
  nextTick,
  nodeOps,
  normalizeClass,
  normalizeProps,
  normalizeStyle,
  onActivated,
  onBeforeMount,
  onBeforeUnmount,
  onBeforeUpdate,
  onDeactivated,
  onErrorCaptured,
  onMounted,
  onRenderTracked,
  onRenderTriggered,
  onScopeDispose,
  onServerPrefetch,
  onUnmounted,
  onUpdated,
  onWatcherCleanup,
  openBlock,
  patchProp,
  popScopeId,
  provide,
  proxyRefs,
  pushScopeId,
  queuePostFlushCb,
  reactive,
  readonly,
  ref,
  registerRuntimeCompiler,
  render,
  renderList,
  renderSlot,
  resolveComponent,
  resolveDirective,
  resolveDynamicComponent,
  resolveFilter,
  resolveTransitionHooks,
  setBlockTracking,
  setDevtoolsHook,
  setTransitionHooks,
  shallowReactive,
  shallowReadonly,
  shallowRef,
  ssrContextKey,
  ssrUtils,
  stop,
  toDisplayString,
  toHandlerKey,
  toHandlers,
  toRaw,
  toRef,
  toRefs,
  toValue,
  transformVNodeArgs,
  triggerRef,
  unref,
  useAttrs,
  useCssModule,
  useCssVars,
  useHost,
  useId,
  useModel,
  useSSRContext,
  useShadowRoot,
  useSlots,
  useTemplateRef,
  useTransitionState,
  vModelCheckbox,
  vModelDynamic,
  vModelRadio,
  vModelSelect,
  vModelText,
  vShow,
  version,
  warn,
  watch,
  watchEffect,
  watchPostEffect,
  watchSyncEffect,
  withAsyncContext,
  withCtx,
  withDefaults,
  withDirectives,
  withKeys,
  withMemo,
  withModifiers,
  withScopeId
}, Symbol.toStringTag, { value: "Module" }));
/*!
 * pinia v3.0.4
 * (c) 2025 Eduardo San Martin Morote
 * @license MIT
 */
let activePinia;
const setActivePinia = (pinia2) => activePinia = pinia2;
const piniaSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function isPlainObject(o) {
  return o && typeof o === "object" && Object.prototype.toString.call(o) === "[object Object]" && typeof o.toJSON !== "function";
}
var MutationType;
(function(MutationType2) {
  MutationType2["direct"] = "direct";
  MutationType2["patchObject"] = "patch object";
  MutationType2["patchFunction"] = "patch function";
})(MutationType || (MutationType = {}));
function createPinia() {
  const scope = effectScope(true);
  const state = scope.run(() => /* @__PURE__ */ ref({}));
  let _p = [];
  let toBeInstalled = [];
  const pinia2 = markRaw({
    install(app) {
      setActivePinia(pinia2);
      pinia2._a = app;
      app.provide(piniaSymbol, pinia2);
      app.config.globalProperties.$pinia = pinia2;
      toBeInstalled.forEach((plugin) => _p.push(plugin));
      toBeInstalled = [];
    },
    use(plugin) {
      if (!this._a) {
        toBeInstalled.push(plugin);
      } else {
        _p.push(plugin);
      }
      return this;
    },
    _p,
    // it's actually undefined here
    // @ts-expect-error
    _a: null,
    _e: scope,
    _s: /* @__PURE__ */ new Map(),
    state
  });
  return pinia2;
}
const noop$2 = () => {
};
function addSubscription(subscriptions, callback, detached, onCleanup = noop$2) {
  subscriptions.add(callback);
  const removeSubscription = () => {
    const isDel = subscriptions.delete(callback);
    isDel && onCleanup();
  };
  if (!detached && getCurrentScope()) {
    onScopeDispose(removeSubscription);
  }
  return removeSubscription;
}
function triggerSubscriptions(subscriptions, ...args) {
  subscriptions.forEach((callback) => {
    callback(...args);
  });
}
const fallbackRunWithContext = (fn) => fn();
const ACTION_MARKER = Symbol();
const ACTION_NAME = Symbol();
function mergeReactiveObjects(target, patchToApply) {
  if (target instanceof Map && patchToApply instanceof Map) {
    patchToApply.forEach((value, key) => target.set(key, value));
  } else if (target instanceof Set && patchToApply instanceof Set) {
    patchToApply.forEach(target.add, target);
  }
  for (const key in patchToApply) {
    if (!patchToApply.hasOwnProperty(key))
      continue;
    const subPatch = patchToApply[key];
    const targetValue = target[key];
    if (isPlainObject(targetValue) && isPlainObject(subPatch) && target.hasOwnProperty(key) && !/* @__PURE__ */ isRef(subPatch) && !/* @__PURE__ */ isReactive(subPatch)) {
      target[key] = mergeReactiveObjects(targetValue, subPatch);
    } else {
      target[key] = subPatch;
    }
  }
  return target;
}
const skipHydrateSymbol = (
  /* istanbul ignore next */
  Symbol()
);
function shouldHydrate(obj) {
  return !isPlainObject(obj) || !Object.prototype.hasOwnProperty.call(obj, skipHydrateSymbol);
}
const { assign } = Object;
function isComputed(o) {
  return !!(/* @__PURE__ */ isRef(o) && o.effect);
}
function createOptionsStore(id, options, pinia2, hot) {
  const { state, actions, getters } = options;
  const initialState = pinia2.state.value[id];
  let store;
  function setup() {
    if (!initialState && true) {
      pinia2.state.value[id] = state ? state() : {};
    }
    const localState = /* @__PURE__ */ toRefs(pinia2.state.value[id]);
    return assign(localState, actions, Object.keys(getters || {}).reduce((computedGetters, name) => {
      computedGetters[name] = markRaw(computed(() => {
        setActivePinia(pinia2);
        const store2 = pinia2._s.get(id);
        return getters[name].call(store2, store2);
      }));
      return computedGetters;
    }, {}));
  }
  store = createSetupStore(id, setup, options, pinia2, hot, true);
  return store;
}
function createSetupStore($id, setup, options = {}, pinia2, hot, isOptionsStore) {
  let scope;
  const optionsForPlugin = assign({ actions: {} }, options);
  const $subscribeOptions = { deep: true };
  let isListening;
  let isSyncListening;
  let subscriptions = /* @__PURE__ */ new Set();
  let actionSubscriptions = /* @__PURE__ */ new Set();
  let debuggerEvents;
  const initialState = pinia2.state.value[$id];
  if (!isOptionsStore && !initialState && true) {
    pinia2.state.value[$id] = {};
  }
  let activeListener;
  function $patch(partialStateOrMutator) {
    let subscriptionMutation;
    isListening = isSyncListening = false;
    if (typeof partialStateOrMutator === "function") {
      partialStateOrMutator(pinia2.state.value[$id]);
      subscriptionMutation = {
        type: MutationType.patchFunction,
        storeId: $id,
        events: debuggerEvents
      };
    } else {
      mergeReactiveObjects(pinia2.state.value[$id], partialStateOrMutator);
      subscriptionMutation = {
        type: MutationType.patchObject,
        payload: partialStateOrMutator,
        storeId: $id,
        events: debuggerEvents
      };
    }
    const myListenerId = activeListener = Symbol();
    nextTick().then(() => {
      if (activeListener === myListenerId) {
        isListening = true;
      }
    });
    isSyncListening = true;
    triggerSubscriptions(subscriptions, subscriptionMutation, pinia2.state.value[$id]);
  }
  const $reset = isOptionsStore ? function $reset2() {
    const { state } = options;
    const newState = state ? state() : {};
    this.$patch(($state) => {
      assign($state, newState);
    });
  } : (
    /* istanbul ignore next */
    noop$2
  );
  function $dispose() {
    scope.stop();
    subscriptions.clear();
    actionSubscriptions.clear();
    pinia2._s.delete($id);
  }
  const action = (fn, name = "") => {
    if (ACTION_MARKER in fn) {
      fn[ACTION_NAME] = name;
      return fn;
    }
    const wrappedAction = function() {
      setActivePinia(pinia2);
      const args = Array.from(arguments);
      const afterCallbackSet = /* @__PURE__ */ new Set();
      const onErrorCallbackSet = /* @__PURE__ */ new Set();
      function after(callback) {
        afterCallbackSet.add(callback);
      }
      function onError(callback) {
        onErrorCallbackSet.add(callback);
      }
      triggerSubscriptions(actionSubscriptions, {
        args,
        name: wrappedAction[ACTION_NAME],
        store,
        after,
        onError
      });
      let ret;
      try {
        ret = fn.apply(this && this.$id === $id ? this : store, args);
      } catch (error) {
        triggerSubscriptions(onErrorCallbackSet, error);
        throw error;
      }
      if (ret instanceof Promise) {
        return ret.then((value) => {
          triggerSubscriptions(afterCallbackSet, value);
          return value;
        }).catch((error) => {
          triggerSubscriptions(onErrorCallbackSet, error);
          return Promise.reject(error);
        });
      }
      triggerSubscriptions(afterCallbackSet, ret);
      return ret;
    };
    wrappedAction[ACTION_MARKER] = true;
    wrappedAction[ACTION_NAME] = name;
    return wrappedAction;
  };
  const partialStore = {
    _p: pinia2,
    // _s: scope,
    $id,
    $onAction: addSubscription.bind(null, actionSubscriptions),
    $patch,
    $reset,
    $subscribe(callback, options2 = {}) {
      const removeSubscription = addSubscription(subscriptions, callback, options2.detached, () => stopWatcher());
      const stopWatcher = scope.run(() => watch(() => pinia2.state.value[$id], (state) => {
        if (options2.flush === "sync" ? isSyncListening : isListening) {
          callback({
            storeId: $id,
            type: MutationType.direct,
            events: debuggerEvents
          }, state);
        }
      }, assign({}, $subscribeOptions, options2)));
      return removeSubscription;
    },
    $dispose
  };
  const store = /* @__PURE__ */ reactive(partialStore);
  pinia2._s.set($id, store);
  const runWithContext = pinia2._a && pinia2._a.runWithContext || fallbackRunWithContext;
  const setupStore = runWithContext(() => pinia2._e.run(() => (scope = effectScope()).run(() => setup({ action }))));
  for (const key in setupStore) {
    const prop = setupStore[key];
    if (/* @__PURE__ */ isRef(prop) && !isComputed(prop) || /* @__PURE__ */ isReactive(prop)) {
      if (!isOptionsStore) {
        if (initialState && shouldHydrate(prop)) {
          if (/* @__PURE__ */ isRef(prop)) {
            prop.value = initialState[key];
          } else {
            mergeReactiveObjects(prop, initialState[key]);
          }
        }
        pinia2.state.value[$id][key] = prop;
      }
    } else if (typeof prop === "function") {
      const actionValue = action(prop, key);
      setupStore[key] = actionValue;
      optionsForPlugin.actions[key] = prop;
    } else ;
  }
  assign(store, setupStore);
  assign(/* @__PURE__ */ toRaw(store), setupStore);
  Object.defineProperty(store, "$state", {
    get: () => pinia2.state.value[$id],
    set: (state) => {
      $patch(($state) => {
        assign($state, state);
      });
    }
  });
  pinia2._p.forEach((extender) => {
    {
      assign(store, scope.run(() => extender({
        store,
        app: pinia2._a,
        pinia: pinia2,
        options: optionsForPlugin
      })));
    }
  });
  if (initialState && isOptionsStore && options.hydrate) {
    options.hydrate(store.$state, initialState);
  }
  isListening = true;
  isSyncListening = true;
  return store;
}
/*! #__NO_SIDE_EFFECTS__ */
// @__NO_SIDE_EFFECTS__
function defineStore(id, setup, setupOptions) {
  let options;
  const isSetupStore = typeof setup === "function";
  options = isSetupStore ? setupOptions : setup;
  function useStore(pinia2, hot) {
    const hasContext = hasInjectionContext();
    pinia2 = // in test mode, ignore the argument provided as we can always retrieve a
    // pinia instance with getActivePinia()
    pinia2 || (hasContext ? inject(piniaSymbol, null) : null);
    if (pinia2)
      setActivePinia(pinia2);
    pinia2 = activePinia;
    if (!pinia2._s.has(id)) {
      if (isSetupStore) {
        createSetupStore(id, setup, options, pinia2);
      } else {
        createOptionsStore(id, options, pinia2);
      }
    }
    const store = pinia2._s.get(id);
    return store;
  }
  useStore.$id = id;
  return useStore;
}
var genericBvnPrefix = "BootstrapVueNext__";
var withBvnPrefix = (value, suffix = "") => {
  const suffixWithTrail = `${suffix}___`;
  return `${genericBvnPrefix}ID__${value}__${suffix ? suffixWithTrail : ""}`;
};
var createBvnInjectionKey = (name) => withBvnPrefix(name);
var createBvnRegistryInjectionKey = (name) => withBvnPrefix(`${name}__registry`);
var progressInjectionKey = createBvnInjectionKey("progress");
var collapseInjectionKey = createBvnInjectionKey("collapse");
var showHideRegistryKey = createBvnRegistryInjectionKey("showHide");
var navbarInjectionKey = createBvnInjectionKey("navbar");
var rtlRegistryKey = createBvnRegistryInjectionKey("rtl");
var breadcrumbGlobalIndexKey = `${genericBvnPrefix}global_breadcrumb`;
var breadcrumbRegistryKey = createBvnRegistryInjectionKey("breadcrumb");
var modalManagerKey = createBvnRegistryInjectionKey("modalManager");
var defaultsKey = createBvnRegistryInjectionKey("defaults");
var inputGroupKey = createBvnInjectionKey("inputGroup");
var orchestratorRegistryKey = createBvnRegistryInjectionKey("orchestrator");
var formGroupKey = createBvnInjectionKey("formGroupPlugin");
var formSelectKey = createBvnInjectionKey("formSelect");
var _newOrchestratorRegistry = () => ({
  store: /* @__PURE__ */ ref([]),
  _isOrchestratorInstalled: /* @__PURE__ */ ref(false),
  _isToastAppend: /* @__PURE__ */ ref(false)
});
function tryOnScopeDispose(fn, failSilently) {
  if (getCurrentScope()) {
    onScopeDispose(fn, failSilently);
    return true;
  }
  return false;
}
var isClient = typeof window !== "undefined" && typeof document !== "undefined";
typeof WorkerGlobalScope !== "undefined" && globalThis instanceof WorkerGlobalScope;
var notNullish = (val) => val != null;
var toString = Object.prototype.toString;
var isObject$1 = (val) => toString.call(val) === "[object Object]";
var timestamp = () => +Date.now();
var noop$1 = () => {
};
var isIOS = /* @__PURE__ */ getIsIOS();
function getIsIOS() {
  var _window, _window2, _window3;
  return isClient && !!((_window = window) === null || _window === void 0 || (_window = _window.navigator) === null || _window === void 0 ? void 0 : _window.userAgent) && (/iP(?:ad|hone|od)/.test(window.navigator.userAgent) || ((_window2 = window) === null || _window2 === void 0 || (_window2 = _window2.navigator) === null || _window2 === void 0 ? void 0 : _window2.maxTouchPoints) > 2 && /iPad|Macintosh/.test((_window3 = window) === null || _window3 === void 0 ? void 0 : _window3.navigator.userAgent));
}
function toRef$1(...args) {
  if (args.length !== 1) return /* @__PURE__ */ toRef(...args);
  const r = args[0];
  return typeof r === "function" ? /* @__PURE__ */ readonly(customRef(() => ({
    get: r,
    set: noop$1
  }))) : /* @__PURE__ */ ref(r);
}
function createFilterWrapper$1(filter, fn) {
  function wrapper(...args) {
    return new Promise((resolve2, reject) => {
      Promise.resolve(filter(() => fn.apply(this, args), {
        fn,
        thisArg: this,
        args
      })).then(resolve2).catch(reject);
    });
  }
  return wrapper;
}
function throttleFilter(...args) {
  let lastExec = 0;
  let timer;
  let isLeading = true;
  let lastRejector = noop$1;
  let lastValue;
  let ms;
  let trailing;
  let leading;
  let rejectOnCancel;
  if (!/* @__PURE__ */ isRef(args[0]) && typeof args[0] === "object") ({ delay: ms, trailing = true, leading = true, rejectOnCancel = false } = args[0]);
  else [ms, trailing = true, leading = true, rejectOnCancel = false] = args;
  const clear = () => {
    if (timer) {
      clearTimeout(timer);
      timer = void 0;
      lastRejector();
      lastRejector = noop$1;
    }
  };
  const filter = (_invoke) => {
    const duration = toValue(ms);
    const elapsed = Date.now() - lastExec;
    const invoke$1 = () => {
      return lastValue = _invoke();
    };
    clear();
    if (duration <= 0) {
      lastExec = Date.now();
      return invoke$1();
    }
    if (elapsed > duration) {
      lastExec = Date.now();
      if (leading || !isLeading) invoke$1();
    } else if (trailing) lastValue = new Promise((resolve2, reject) => {
      lastRejector = rejectOnCancel ? reject : resolve2;
      timer = setTimeout(() => {
        lastExec = Date.now();
        isLeading = true;
        resolve2(invoke$1());
        clear();
      }, Math.max(0, duration - elapsed));
    });
    if (!leading && !timer) timer = setTimeout(() => isLeading = true, duration);
    isLeading = false;
    return lastValue;
  };
  return filter;
}
function toArray(value) {
  return Array.isArray(value) ? value : [value];
}
// @__NO_SIDE_EFFECTS__
function createSharedComposable(composable) {
  if (!isClient) return composable;
  let subscribers = 0;
  let state;
  let scope;
  const dispose = () => {
    subscribers -= 1;
    if (scope && subscribers <= 0) {
      scope.stop();
      state = void 0;
      scope = void 0;
    }
  };
  return ((...args) => {
    subscribers += 1;
    if (!scope) {
      scope = effectScope(true);
      state = scope.run(() => composable(...args));
    }
    tryOnScopeDispose(dispose);
    return state;
  });
}
// @__NO_SIDE_EFFECTS__
function useThrottleFn(fn, ms = 200, trailing = false, leading = true, rejectOnCancel = false) {
  return createFilterWrapper$1(throttleFilter(ms, trailing, leading, rejectOnCancel), fn);
}
function useIntervalFn(cb, interval = 1e3, options = {}) {
  const { immediate = true, immediateCallback = false } = options;
  let timer = null;
  const isActive = /* @__PURE__ */ shallowRef(false);
  function clean() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
  }
  function pause() {
    isActive.value = false;
    clean();
  }
  function resume() {
    const intervalValue = toValue(interval);
    if (intervalValue <= 0) return;
    isActive.value = true;
    if (immediateCallback) cb();
    clean();
    if (isActive.value) timer = setInterval(cb, intervalValue);
  }
  if (immediate && isClient) resume();
  if (/* @__PURE__ */ isRef(interval) || typeof interval === "function") tryOnScopeDispose(watch(interval, () => {
    if (isActive.value && isClient) resume();
  }));
  tryOnScopeDispose(pause);
  return {
    isActive: /* @__PURE__ */ shallowReadonly(isActive),
    pause,
    resume
  };
}
// @__NO_SIDE_EFFECTS__
function useToNumber(value, options = {}) {
  const { method = "parseFloat", radix, nanToZero } = options;
  return computed(() => {
    let resolved = toValue(value);
    if (typeof method === "function") resolved = method(resolved);
    else if (typeof resolved === "string") resolved = Number[method](resolved, radix);
    if (nanToZero && Number.isNaN(resolved)) resolved = 0;
    return resolved;
  });
}
function watchImmediate(source, cb, options) {
  return watch(source, cb, {
    ...options,
    immediate: true
  });
}
var defaultWindow = isClient ? window : void 0;
var defaultDocument = isClient ? window.document : void 0;
function unrefElement(elRef) {
  var _$el;
  const plain = toValue(elRef);
  return (_$el = plain === null || plain === void 0 ? void 0 : plain.$el) !== null && _$el !== void 0 ? _$el : plain;
}
function useEventListener(...args) {
  const register = (el, event, listener, options) => {
    el.addEventListener(event, listener, options);
    return () => el.removeEventListener(event, listener, options);
  };
  const firstParamTargets = computed(() => {
    const test = toArray(toValue(args[0])).filter((e) => e != null);
    return test.every((e) => typeof e !== "string") ? test : void 0;
  });
  return watchImmediate(() => {
    var _firstParamTargets$va, _firstParamTargets$va2;
    return [
      (_firstParamTargets$va = (_firstParamTargets$va2 = firstParamTargets.value) === null || _firstParamTargets$va2 === void 0 ? void 0 : _firstParamTargets$va2.map((e) => unrefElement(e))) !== null && _firstParamTargets$va !== void 0 ? _firstParamTargets$va : [defaultWindow].filter((e) => e != null),
      toArray(toValue(firstParamTargets.value ? args[1] : args[0])),
      toArray(unref(firstParamTargets.value ? args[2] : args[1])),
      toValue(firstParamTargets.value ? args[3] : args[2])
    ];
  }, ([raw_targets, raw_events, raw_listeners, raw_options], _, onCleanup) => {
    if (!(raw_targets === null || raw_targets === void 0 ? void 0 : raw_targets.length) || !(raw_events === null || raw_events === void 0 ? void 0 : raw_events.length) || !(raw_listeners === null || raw_listeners === void 0 ? void 0 : raw_listeners.length)) return;
    const optionsClone = isObject$1(raw_options) ? { ...raw_options } : raw_options;
    const cleanups = raw_targets.flatMap((el) => raw_events.flatMap((event) => raw_listeners.map((listener) => register(el, event, listener, optionsClone))));
    onCleanup(() => {
      cleanups.forEach((fn) => fn());
    });
  }, { flush: "post" });
}
// @__NO_SIDE_EFFECTS__
function useMounted() {
  const isMounted = /* @__PURE__ */ shallowRef(false);
  const instance = getCurrentInstance();
  if (instance) onMounted(() => {
    isMounted.value = true;
  }, instance);
  return isMounted;
}
// @__NO_SIDE_EFFECTS__
function useSupported(callback) {
  const isMounted = /* @__PURE__ */ useMounted();
  return computed(() => {
    isMounted.value;
    return Boolean(callback());
  });
}
function useMutationObserver(target, callback, options = {}) {
  const { window: window$1 = defaultWindow, ...mutationOptions } = options;
  let observer;
  const isSupported = /* @__PURE__ */ useSupported(() => window$1 && "MutationObserver" in window$1);
  const cleanup = () => {
    if (observer) {
      observer.disconnect();
      observer = void 0;
    }
  };
  const stopWatch = watch(computed(() => {
    const items = toArray(toValue(target)).map(unrefElement).filter(notNullish);
    return new Set(items);
  }), (newTargets) => {
    cleanup();
    if (isSupported.value && newTargets.size) {
      observer = new MutationObserver(callback);
      newTargets.forEach((el) => observer.observe(el, mutationOptions));
    }
  }, {
    immediate: true,
    flush: "post"
  });
  const takeRecords = () => {
    return observer === null || observer === void 0 ? void 0 : observer.takeRecords();
  };
  const stop2 = () => {
    stopWatch();
    cleanup();
  };
  tryOnScopeDispose(stop2);
  return {
    isSupported,
    stop: stop2,
    takeRecords
  };
}
function onElementRemoval(target, callback, options = {}) {
  const { window: window$1 = defaultWindow, document: document$1 = window$1 === null || window$1 === void 0 ? void 0 : window$1.document, flush = "sync" } = options;
  if (!window$1 || !document$1) return noop$1;
  let stopFn;
  const cleanupAndUpdate = (fn) => {
    stopFn === null || stopFn === void 0 || stopFn();
    stopFn = fn;
  };
  const stopWatch = watchEffect(() => {
    const el = unrefElement(target);
    if (el) {
      const { stop: stop2 } = useMutationObserver(document$1, (mutationsList) => {
        if (mutationsList.map((mutation) => [...mutation.removedNodes]).flat().some((node) => node === el || node.contains(el))) callback(mutationsList);
      }, {
        window: window$1,
        childList: true,
        subtree: true
      });
      cleanupAndUpdate(stop2);
    }
  }, { flush });
  const stopHandle = () => {
    stopWatch();
    cleanupAndUpdate();
  };
  tryOnScopeDispose(stopHandle);
  return stopHandle;
}
function createKeyPredicate(keyFilter) {
  if (typeof keyFilter === "function") return keyFilter;
  else if (typeof keyFilter === "string") return (event) => event.key === keyFilter;
  else if (Array.isArray(keyFilter)) return (event) => keyFilter.includes(event.key);
  return () => true;
}
function onKeyStroke(...args) {
  let key;
  let handler;
  let options = {};
  if (args.length === 3) {
    key = args[0];
    handler = args[1];
    options = args[2];
  } else if (args.length === 2) if (typeof args[1] === "object") {
    key = true;
    handler = args[0];
    options = args[1];
  } else {
    key = args[0];
    handler = args[1];
  }
  else {
    key = true;
    handler = args[0];
  }
  const { target = defaultWindow, eventName = "keydown", passive = false, dedupe = false } = options;
  const predicate = createKeyPredicate(key);
  const listener = (e) => {
    if (e.repeat && toValue(dedupe)) return;
    if (predicate(e)) handler(e);
  };
  return useEventListener(target, eventName, listener, passive);
}
function useRafFn(fn, options = {}) {
  const { immediate = true, fpsLimit = null, window: window$1 = defaultWindow, once = false } = options;
  const isActive = /* @__PURE__ */ shallowRef(false);
  const intervalLimit = computed(() => {
    const limit = toValue(fpsLimit);
    return limit ? 1e3 / limit : null;
  });
  let previousFrameTimestamp = 0;
  let rafId = null;
  function loop(timestamp$1) {
    if (!isActive.value || !window$1) return;
    if (!previousFrameTimestamp) previousFrameTimestamp = timestamp$1;
    const delta = timestamp$1 - previousFrameTimestamp;
    if (intervalLimit.value && delta < intervalLimit.value) {
      rafId = window$1.requestAnimationFrame(loop);
      return;
    }
    previousFrameTimestamp = timestamp$1;
    fn({
      delta,
      timestamp: timestamp$1
    });
    if (once) {
      isActive.value = false;
      rafId = null;
      return;
    }
    rafId = window$1.requestAnimationFrame(loop);
  }
  function resume() {
    if (!isActive.value && window$1) {
      isActive.value = true;
      previousFrameTimestamp = 0;
      rafId = window$1.requestAnimationFrame(loop);
    }
  }
  function pause() {
    isActive.value = false;
    if (rafId != null && window$1) {
      window$1.cancelAnimationFrame(rafId);
      rafId = null;
    }
  }
  if (immediate) resume();
  tryOnScopeDispose(pause);
  return {
    isActive: /* @__PURE__ */ readonly(isActive),
    pause,
    resume
  };
}
var _global = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
var globalKey = "__vueuse_ssr_handlers__";
var handlers = /* @__PURE__ */ getHandlers();
function getHandlers() {
  if (!(globalKey in _global)) _global[globalKey] = _global[globalKey] || {};
  return _global[globalKey];
}
function getSSRHandler(key, fallback) {
  return handlers[key] || fallback;
}
// @__NO_SIDE_EFFECTS__
function useDocumentVisibility(options = {}) {
  const { document: document$1 = defaultDocument } = options;
  if (!document$1) return /* @__PURE__ */ shallowRef("visible");
  const visibility = /* @__PURE__ */ shallowRef(document$1.visibilityState);
  useEventListener(document$1, "visibilitychange", () => {
    visibility.value = document$1.visibilityState;
  }, { passive: true });
  return visibility;
}
function useElementHover(el, options = {}) {
  const { delayEnter = 0, delayLeave = 0, triggerOnRemoval = false, window: window$1 = defaultWindow } = options;
  const isHovered = /* @__PURE__ */ shallowRef(false);
  let timer;
  const toggle = (entering) => {
    const delay3 = entering ? delayEnter : delayLeave;
    if (timer) {
      clearTimeout(timer);
      timer = void 0;
    }
    if (delay3) timer = setTimeout(() => isHovered.value = entering, delay3);
    else isHovered.value = entering;
  };
  if (!window$1) return isHovered;
  useEventListener(el, "mouseenter", () => toggle(true), { passive: true });
  useEventListener(el, "mouseleave", () => toggle(false), { passive: true });
  if (triggerOnRemoval) onElementRemoval(computed(() => unrefElement(el)), () => toggle(false));
  return isHovered;
}
function useFocus(target, options = {}) {
  const { initialValue = false, focusVisible = false, preventScroll = false } = options;
  const innerFocused = /* @__PURE__ */ shallowRef(false);
  const targetElement = computed(() => unrefElement(target));
  const listenerOptions = { passive: true };
  useEventListener(targetElement, "focus", (event) => {
    var _matches, _ref;
    if (!focusVisible || ((_matches = (_ref = event.target).matches) === null || _matches === void 0 ? void 0 : _matches.call(_ref, ":focus-visible"))) innerFocused.value = true;
  }, listenerOptions);
  useEventListener(targetElement, "blur", () => innerFocused.value = false, listenerOptions);
  const focused = computed({
    get: () => innerFocused.value,
    set(value) {
      var _targetElement$value, _targetElement$value2;
      if (!value && innerFocused.value) (_targetElement$value = targetElement.value) === null || _targetElement$value === void 0 || _targetElement$value.blur();
      else if (value && !innerFocused.value) (_targetElement$value2 = targetElement.value) === null || _targetElement$value2 === void 0 || _targetElement$value2.focus({ preventScroll });
    }
  });
  watch(targetElement, () => {
    focused.value = initialValue;
  }, {
    immediate: true,
    flush: "post"
  });
  return { focused };
}
function resolveElement(el) {
  if (typeof Window !== "undefined" && el instanceof Window) return el.document.documentElement;
  if (typeof Document !== "undefined" && el instanceof Document) return el.documentElement;
  return el;
}
function checkOverflowScroll(ele) {
  const style = window.getComputedStyle(ele);
  if (style.overflowX === "scroll" || style.overflowY === "scroll" || style.overflowX === "auto" && ele.clientWidth < ele.scrollWidth || style.overflowY === "auto" && ele.clientHeight < ele.scrollHeight) return true;
  else {
    const parent = ele.parentNode;
    if (!parent || parent.tagName === "BODY") return false;
    return checkOverflowScroll(parent);
  }
}
function preventDefault(rawEvent) {
  const e = rawEvent || window.event;
  const _target = e.target;
  if (checkOverflowScroll(_target)) return false;
  if (e.touches.length > 1) return true;
  if (e.preventDefault) e.preventDefault();
  return false;
}
var elInitialOverflow = /* @__PURE__ */ new WeakMap();
function useScrollLock$1(element, initialState = false) {
  const isLocked = /* @__PURE__ */ shallowRef(initialState);
  let stopTouchMoveListener = null;
  let initialOverflow = "";
  watch(toRef$1(element), (el) => {
    const target = resolveElement(toValue(el));
    if (target) {
      const ele = target;
      if (!elInitialOverflow.get(ele)) elInitialOverflow.set(ele, ele.style.overflow);
      if (ele.style.overflow !== "hidden") initialOverflow = ele.style.overflow;
      if (ele.style.overflow === "hidden") return isLocked.value = true;
      if (isLocked.value) return ele.style.overflow = "hidden";
    }
  }, { immediate: true });
  const lock = () => {
    const el = resolveElement(toValue(element));
    if (!el || isLocked.value) return;
    if (isIOS) stopTouchMoveListener = useEventListener(el, "touchmove", (e) => {
      preventDefault(e);
    }, { passive: false });
    el.style.overflow = "hidden";
    isLocked.value = true;
  };
  const unlock = () => {
    const el = resolveElement(toValue(element));
    if (!el || !isLocked.value) return;
    if (isIOS) stopTouchMoveListener === null || stopTouchMoveListener === void 0 || stopTouchMoveListener();
    el.style.overflow = initialOverflow;
    elInitialOverflow.delete(el);
    isLocked.value = false;
  };
  tryOnScopeDispose(unlock);
  return computed({
    get() {
      return isLocked.value;
    },
    set(v) {
      if (v) lock();
      else unlock();
    }
  });
}
function getDefaultScheduler$2(options) {
  if ("interval" in options || "immediate" in options) {
    const { interval = "requestAnimationFrame", immediate = true } = options;
    return interval === "requestAnimationFrame" ? (cb) => useRafFn(cb, { immediate }) : (cb) => useIntervalFn(cb, interval, { immediate });
  }
  return useRafFn;
}
function useTimestamp(options = {}) {
  const { controls: exposeControls = false, offset = 0, scheduler = getDefaultScheduler$2(options), callback } = options;
  const ts = /* @__PURE__ */ shallowRef(timestamp() + offset);
  const update = () => ts.value = timestamp() + offset;
  const controls = scheduler(callback ? () => {
    update();
    callback(ts.value);
  } : update);
  if (exposeControls) return {
    timestamp: ts,
    ...controls
  };
  else return ts;
}
var getSafeDocument = () => typeof document !== "undefined" ? document : null;
var getSafeWindow = () => typeof window !== "undefined" ? window : null;
var getActiveElement = (excludes = []) => {
  const doc2 = getSafeDocument();
  if (doc2 === null) return null;
  const { activeElement } = doc2;
  return activeElement && !(excludes == null ? void 0 : excludes.some((el) => el === activeElement)) ? activeElement : null;
};
var attemptFocus = (el, options = {}) => {
  const isActiveElement = (el2) => el2 === getActiveElement();
  try {
    el.focus(options);
  } catch (e) {
    console.error(e);
  }
  return isActiveElement(el);
};
var isEmptySlot = (el) => ((el == null ? void 0 : el()) ?? []).length === 0;
var isVisible = (el) => {
  if (el.getAttribute("display") === "none") return false;
  const bcr = el.getBoundingClientRect();
  return bcr && bcr.height > 0 && bcr.width > 0;
};
var defaultZModelIndex = 1055;
var getModalZIndex = (element) => {
  const win = getSafeWindow();
  const doc2 = getSafeDocument();
  if (win === null || doc2 === null) return defaultZModelIndex;
  const target = element ?? doc2.body;
  const raw = win.getComputedStyle(target).getPropertyValue("--bs-modal-zindex").trim();
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : defaultZModelIndex;
};
function injectSelf(key, vm = getCurrentInstance$1("injectSelf")) {
  const { provides } = vm;
  if (provides && key in provides) return provides[key];
}
function getCurrentInstance$1(name, message) {
  const vm = getCurrentInstance();
  if (!vm) throw new Error(`[Bvn] ${name} ${"must be called from inside a setup function"}`);
  return vm;
}
var toKebabCase = (str = "") => str.replace(/[^a-z]/gi, "-").replace(/\B([A-Z])/g, "-$1").toLowerCase();
var isObject = (obj) => obj !== null && typeof obj === "object" && !Array.isArray(obj);
function mergeDeep(source = {}, target = {}, arrayFn) {
  const out = {};
  for (const key in source) out[key] = source[key];
  for (const key in target) {
    const sourceProperty = source[key];
    const targetProperty = target[key];
    if (isObject(sourceProperty) && isObject(targetProperty)) {
      out[key] = mergeDeep(sourceProperty, targetProperty);
      continue;
    }
    out[key] = targetProperty;
  }
  return out;
}
var propIsDefined = (vnode, prop) => {
  var _a, _b;
  return typeof ((_a = vnode.props) == null ? void 0 : _a[prop]) !== "undefined" || typeof ((_b = vnode.props) == null ? void 0 : _b[toKebabCase(prop)]) !== "undefined";
};
function internalUseDefaults(props = {}, name) {
  const defaults = inject(defaultsKey, /* @__PURE__ */ ref({}));
  const vm = getCurrentInstance$1("useDefaults");
  name = name ?? vm.type.name ?? vm.type.__name;
  if (!name) throw new Error("[Bvn] Could not determine component name");
  const componentDefaults = computed(() => {
    var _a;
    return (_a = defaults.value) == null ? void 0 : _a[props._as ?? name];
  });
  const _props = new Proxy(props, { get(target, prop) {
    var _a, _b, _c, _d;
    const propValue = Reflect.get(target, prop);
    if (prop === "class" || prop === "style") return [(_a = componentDefaults.value) == null ? void 0 : _a[prop], propValue].filter((v) => v != null);
    else if (typeof prop === "string" && !propIsDefined(vm.vnode, prop)) return ((_b = componentDefaults.value) == null ? void 0 : _b[prop]) ?? ((_d = (_c = defaults.value) == null ? void 0 : _c.global) == null ? void 0 : _d[prop]) ?? propValue;
    return propValue;
  } });
  const _subcomponentDefaults = /* @__PURE__ */ shallowRef();
  watchEffect(() => {
    if (componentDefaults.value) {
      const subComponents = Object.entries(componentDefaults.value).filter(([key]) => key[0] !== void 0 && key.startsWith(key[0].toUpperCase()));
      _subcomponentDefaults.value = subComponents.length ? Object.fromEntries(subComponents) : void 0;
    } else _subcomponentDefaults.value = void 0;
  });
  function provideSubDefaults() {
    const injected = injectSelf(defaultsKey, vm);
    provide(defaultsKey, computed(() => _subcomponentDefaults.value ? mergeDeep((injected == null ? void 0 : injected.value) ?? {}, _subcomponentDefaults.value) : injected == null ? void 0 : injected.value));
  }
  return {
    props: _props,
    provideSubDefaults
  };
}
function useDefaults(props, name) {
  const { props: _props, provideSubDefaults } = internalUseDefaults(props, name);
  provideSubDefaults();
  return _props;
}
var useId$1 = (id, suffix) => {
  const genId = useId();
  return computed(() => toValue(id) || withBvnPrefix(genId || "", suffix));
};
var BvEvent = class BvEvent2 {
  constructor(eventType, eventInit = {}) {
    __publicField(this, "cancelable", true);
    __publicField(this, "componentId", null);
    __publicField(this, "_defaultPrevented", false);
    __publicField(this, "eventType", "");
    __publicField(this, "nativeEvent", null);
    __publicField(this, "_preventDefault");
    __publicField(this, "relatedTarget", null);
    __publicField(this, "target", null);
    if (!eventType) throw new TypeError(`Failed to construct '${this.constructor.name}'. 1 argument required, ${arguments.length} given.`);
    Object.assign(this, BvEvent2.Defaults, eventInit, { eventType });
    this._preventDefault = function _preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    };
  }
  get defaultPrevented() {
    return this._defaultPrevented;
  }
  set defaultPrevented(prop) {
    this._defaultPrevented = prop;
  }
  get preventDefault() {
    return this._preventDefault;
  }
  set preventDefault(setter) {
    this._preventDefault = setter;
  }
  static get Defaults() {
    return {
      cancelable: true,
      componentId: null,
      eventType: "",
      nativeEvent: null,
      relatedTarget: null,
      target: null
    };
  }
};
var BvTriggerableEvent = class extends BvEvent {
  constructor(eventType, eventInit = {}) {
    super(eventType, eventInit);
    __publicField(this, "trigger", null);
    __publicField(this, "ok");
    Object.assign(this, BvEvent.Defaults, eventInit, { eventType });
  }
  static get Defaults() {
    return {
      ...super.Defaults,
      trigger: null,
      ok: void 0
    };
  }
};
var noop = () => {
};
var fadeBaseTransitionProps = {
  name: "fade",
  enterActiveClass: "",
  enterFromClass: "showing",
  enterToClass: "",
  leaveActiveClass: "",
  leaveFromClass: "",
  leaveToClass: "showing",
  css: true
};
var useShowHide = (modelValue, props, emit2, element, computedId, options = {
  transitionProps: {},
  showFn: () => {
  },
  hideFn: () => {
  }
}) => {
  var _a, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  let noAction = false;
  const initialShow = !!modelValue.value && !props.initialAnimation || props.visible || false;
  const showRef = /* @__PURE__ */ ref(initialShow);
  const renderRef = /* @__PURE__ */ ref(initialShow);
  const renderBackdropRef = /* @__PURE__ */ ref(initialShow);
  let isCountdown = typeof modelValue.value !== "boolean";
  watch(modelValue, () => {
    isCountdown = typeof modelValue.value !== "boolean";
    if (noAction) {
      noAction = false;
      return;
    }
    if (modelValue.value) show();
    else hide("modelValue", true);
  });
  const localNoAnimation = /* @__PURE__ */ ref(initialShow);
  const localTemporaryHide = /* @__PURE__ */ ref(false);
  const computedNoAnimation = computed(() => props.noAnimation || props.noFade || localNoAnimation.value || false);
  let isMounted = false;
  onMounted(() => {
    var _a2;
    isMounted = true;
    if (!props.show && initialShow) {
      const event = buildTriggerableEvent("show", { cancelable: true });
      emit2("show", event);
      if (event.defaultPrevented) {
        emit2("show-prevented", buildTriggerableEvent("show-prevented"));
        return;
      }
      localNoAnimation.value = true;
      if (!modelValue.value) {
        noAction = true;
        modelValue.value = true;
      }
      renderRef.value = true;
      renderBackdropRef.value = true;
      isVisible2.value = true;
      backdropVisible.value = true;
      backdropReady.value = true;
      showRef.value = true;
      (_a2 = options.showFn) == null ? void 0 : _a2.call(options);
    } else if (props.show || !!modelValue.value && props.initialAnimation) show();
  });
  watch(() => props.visible, (newval) => {
    localNoAnimation.value = true;
    nextTick(() => {
      if (newval) isVisible2.value = true;
      if (newval) show();
      else hide("visible-prop", true);
    });
  });
  watch(() => props.show, (newval) => {
    if (newval) show();
    else hide("show-prop", true);
  });
  useEventListener(element, "bv-toggle", () => {
    modelValue.value = !modelValue.value;
  }, { passive: true });
  const buildTriggerableEvent = (type, opts = {}) => new BvTriggerableEvent(type, {
    cancelable: false,
    target: (element == null ? void 0 : element.value) || null,
    relatedTarget: null,
    trigger: null,
    ...opts,
    componentId: computedId == null ? void 0 : computedId.value
  });
  let showTimeout;
  let hideTimeout;
  let _Resolve;
  let _Promise;
  let _resolveOnHide;
  const show = (resolveOnHide = false) => {
    if (showRef.value && !hideTimeout && !_Promise) return Promise.resolve(true);
    _resolveOnHide = resolveOnHide;
    if (showRef.value && !hideTimeout && _Promise) return _Promise;
    _Promise = new Promise((resolve2) => {
      _Resolve = resolve2;
    });
    const event = buildTriggerableEvent("show", { cancelable: true });
    emit2("show", event);
    if (event.defaultPrevented) {
      emit2("show-prevented", buildTriggerableEvent("show-prevented"));
      if (isVisible2.value) isVisible2.value = false;
      if (modelValue.value && !isCountdown) {
        noAction = true;
        nextTick(() => {
          modelValue.value = false;
        });
      }
      _Resolve == null ? void 0 : _Resolve("show-prevented");
      return _Promise;
    }
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = void 0;
    }
    renderRef.value = true;
    renderBackdropRef.value = true;
    requestAnimationFrame(() => {
      var _a2, _b2;
      if (localNoAnimation.value || props.delay === void 0) {
        if (!isMounted) return;
        showTimeout = void 0;
        showRef.value = true;
        (_a2 = options.showFn) == null ? void 0 : _a2.call(options);
        if (!modelValue.value) {
          noAction = true;
          nextTick(() => {
            modelValue.value = true;
          });
        }
        return;
      }
      showTimeout = setTimeout(() => {
        var _a3;
        if (!isMounted) return;
        showTimeout = void 0;
        showRef.value = true;
        (_a3 = options.showFn) == null ? void 0 : _a3.call(options);
        if (!modelValue.value) {
          noAction = true;
          nextTick(() => {
            modelValue.value = true;
          });
        }
      }, typeof props.delay === "number" ? props.delay : ((_b2 = props.delay) == null ? void 0 : _b2.show) || 0);
    });
    return _Promise;
  };
  let leaveTrigger;
  const hide = (trigger2, noTriggerEmit) => {
    var _a2;
    if (!showRef.value && !showTimeout && !renderRef.value) return Promise.resolve("");
    if (!_Promise) _Promise = new Promise((resolve2) => {
      _Resolve = resolve2;
    });
    if (typeof trigger2 !== "string") trigger2 = void 0;
    leaveTrigger = trigger2;
    const event = buildTriggerableEvent("hide", {
      cancelable: true,
      trigger: trigger2
    });
    const event2 = buildTriggerableEvent(trigger2 || "ignore", {
      cancelable: true,
      trigger: trigger2
    });
    if (trigger2 === "backdrop" && props.noCloseOnBackdrop || trigger2 === "esc" && props.noCloseOnEsc) {
      emit2("hide-prevented", buildTriggerableEvent("hide-prevented", { trigger: trigger2 }));
      _Resolve == null ? void 0 : _Resolve("hide-prevented");
      return _Promise;
    }
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = void 0;
    }
    if (trigger2 && !noTriggerEmit) emit2(trigger2, event2);
    emit2("hide", event);
    if (event.defaultPrevented || event2.defaultPrevented) {
      emit2("hide-prevented", buildTriggerableEvent("hide-prevented", { trigger: trigger2 }));
      if (!modelValue.value) nextTick(() => {
        noAction = true;
        modelValue.value = true;
      });
      _Resolve == null ? void 0 : _Resolve("hide-prevented");
      return _Promise;
    }
    trapActive.value = false;
    if (showTimeout) {
      clearTimeout(showTimeout);
      showTimeout = void 0;
      if (!localTemporaryHide.value) renderRef.value = false;
      renderBackdropRef.value = false;
    }
    hideTimeout = setTimeout(() => {
      var _a3;
      if (!isMounted) return;
      hideTimeout = void 0;
      isLeaving.value = true;
      showRef.value = false;
      (_a3 = options.hideFn) == null ? void 0 : _a3.call(options);
      if (modelValue.value) {
        noAction = true;
        modelValue.value = isCountdown ? 0 : false;
      }
    }, localNoAnimation.value ? 0 : typeof props.delay === "number" ? props.delay : ((_a2 = props.delay) == null ? void 0 : _a2.hide) || 0);
    return _Promise;
  };
  const throttleHide = /* @__PURE__ */ useThrottleFn((a) => hide(a), 500);
  const throttleShow = /* @__PURE__ */ useThrottleFn(() => show(), 500);
  const toggle = (resolveOnHide = false) => {
    const e = buildTriggerableEvent("toggle", { cancelable: true });
    emit2("toggle", e);
    if (e.defaultPrevented) {
      emit2("toggle-prevented", buildTriggerableEvent("toggle-prevented"));
      return Promise.resolve("toggle-prevented");
    }
    if (showRef.value) return hide("toggle-function", true);
    return show(resolveOnHide);
  };
  const triggerToggle = () => {
    const e = buildTriggerableEvent("toggle", { cancelable: true });
    emit2("toggle", e);
    if (e.defaultPrevented) {
      emit2("toggle-prevented", buildTriggerableEvent("toggle-prevented"));
      return;
    }
    if (showRef.value) hide("toggle-trigger", true);
    else show();
  };
  const triggerRegistry = [];
  const registerTrigger = (trigger2, el) => {
    triggerRegistry.push({
      trigger: trigger2,
      el
    });
    el.addEventListener(trigger2, triggerToggle);
    checkVisibility(el);
  };
  const unregisterTrigger = (trigger2, el, clean = true) => {
    const idx = triggerRegistry.findIndex((t) => (t == null ? void 0 : t.trigger) === trigger2 && t.el === el);
    if (idx > -1) {
      triggerRegistry.splice(idx, 1);
      el.removeEventListener(trigger2, triggerToggle);
      if (clean) {
        el.removeAttribute("aria-expanded");
        el.classList.remove("collapsed");
        el.classList.remove("not-collapsed");
      }
    }
  };
  const appRegistry = (_a = inject(showHideRegistryKey, null)) == null ? void 0 : _a.register({
    id: computedId.value,
    toggle,
    show,
    hide,
    value: /* @__PURE__ */ readonly(showRef),
    registerTrigger,
    unregisterTrigger,
    component: getCurrentInstance()
  });
  const checkVisibility = (el) => {
    el.setAttribute("aria-expanded", modelValue.value ? "true" : "false");
    el.classList.toggle("collapsed", !modelValue.value);
    el.classList.toggle("not-collapsed", !!modelValue.value);
  };
  watch(modelValue, () => {
    triggerRegistry.forEach((t) => {
      checkVisibility(t.el);
    });
  });
  watch(computedId, (newId, oldId) => {
    appRegistry == null ? void 0 : appRegistry.updateId(newId, oldId);
  });
  onBeforeUnmount(() => {
    appRegistry == null ? void 0 : appRegistry.unregister();
    triggerRegistry.forEach((t) => {
      t.el.removeEventListener(t.trigger, triggerToggle);
    });
  });
  onUnmounted(() => {
    isMounted = false;
    clearTimeout(showTimeout);
    clearTimeout(hideTimeout);
    showTimeout = void 0;
    hideTimeout = void 0;
  });
  const lazyLoadCompleted = /* @__PURE__ */ ref(false);
  const markLazyLoadCompleted = () => {
    if (props.lazy === true) lazyLoadCompleted.value = true;
  };
  const isLeaving = /* @__PURE__ */ ref(false);
  const isActive = /* @__PURE__ */ ref(initialShow);
  const isVisible2 = /* @__PURE__ */ ref(initialShow);
  const onBeforeEnter = [...[((_b = options.transitionProps) == null ? void 0 : _b.onBeforeEnter) ?? noop, ((_c = props.transitionProps) == null ? void 0 : _c.onBeforeEnter) ?? noop].flat(), () => {
    isActive.value = true;
  }];
  const onEnter = [() => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        isVisible2.value = true;
      });
    });
  }, ...[((_d = options.transitionProps) == null ? void 0 : _d.onEnter) ?? noop, ((_e = props.transitionProps) == null ? void 0 : _e.onEnter) ?? noop].flat()];
  const onAfterEnter = [
    markLazyLoadCompleted,
    ...[((_f = options.transitionProps) == null ? void 0 : _f.onAfterEnter) ?? noop, ((_g = props.transitionProps) == null ? void 0 : _g.onAfterEnter) ?? noop].flat(),
    () => {
      if (localNoAnimation.value) requestAnimationFrame(() => {
        localNoAnimation.value = false;
      });
      if (localTemporaryHide.value) localTemporaryHide.value = false;
      requestAnimationFrame(() => {
        trapActive.value = true;
        nextTick(() => {
          emit2("shown", buildTriggerableEvent("shown", { cancelable: false }));
        });
      });
      if (!_resolveOnHide) {
        _Resolve == null ? void 0 : _Resolve(true);
        _Promise = void 0;
        _Resolve = void 0;
      }
    }
  ];
  const onBeforeLeave = [
    () => {
      if (!isLeaving.value) isLeaving.value = true;
    },
    ...[((_h = options.transitionProps) == null ? void 0 : _h.onBeforeLeave) ?? noop, ((_i = props.transitionProps) == null ? void 0 : _i.onBeforeLeave) ?? noop].flat(),
    () => {
      trapActive.value = false;
    }
  ];
  const onLeave = [() => {
    isVisible2.value = false;
  }, ...[((_j = options.transitionProps) == null ? void 0 : _j.onLeave) ?? noop, ((_k = props.transitionProps) == null ? void 0 : _k.onLeave) ?? noop].flat()];
  const onAfterLeave = [
    () => {
      emit2("hidden", buildTriggerableEvent("hidden", {
        trigger: leaveTrigger,
        cancelable: false
      }));
    },
    ...[((_l = options.transitionProps) == null ? void 0 : _l.onAfterLeave) ?? noop, ((_m = props.transitionProps) == null ? void 0 : _m.onAfterLeave) ?? noop].flat(),
    () => {
      isLeaving.value = false;
      isActive.value = false;
      if (localNoAnimation.value) requestAnimationFrame(() => {
        localNoAnimation.value = false;
      });
      requestAnimationFrame(() => {
        if (!localTemporaryHide.value) renderRef.value = false;
      });
      _Resolve == null ? void 0 : _Resolve(leaveTrigger || "");
      _Promise = void 0;
      _Resolve = void 0;
      leaveTrigger = void 0;
    }
  ];
  const contentShowing = computed(() => localTemporaryHide.value === true || isActive.value === true || props.lazy === false || props.lazy === true && lazyLoadCompleted.value === true && props.unmountLazy === false);
  const trapActive = /* @__PURE__ */ ref(false);
  const backdropVisible = /* @__PURE__ */ ref(false);
  const backdropReady = /* @__PURE__ */ ref(false);
  const transitionFunctions = {
    ...options.transitionProps,
    onBeforeEnter,
    onEnter,
    onAfterEnter,
    onBeforeLeave,
    onLeave,
    onAfterLeave
  };
  return {
    showRef: /* @__PURE__ */ readonly(showRef),
    renderRef: /* @__PURE__ */ readonly(renderRef),
    renderBackdropRef: /* @__PURE__ */ readonly(renderBackdropRef),
    isVisible: /* @__PURE__ */ readonly(isVisible2),
    isActive: /* @__PURE__ */ readonly(isActive),
    trapActive: /* @__PURE__ */ readonly(trapActive),
    show,
    hide,
    toggle,
    throttleHide,
    throttleShow,
    buildTriggerableEvent,
    computedNoAnimation,
    localNoAnimation: /* @__PURE__ */ readonly(localNoAnimation),
    setLocalNoAnimation: (value) => {
      localNoAnimation.value = value;
    },
    localTemporaryHide: /* @__PURE__ */ readonly(localTemporaryHide),
    setLocalTemporaryHide: (value) => {
      localTemporaryHide.value = value;
    },
    isLeaving: /* @__PURE__ */ readonly(isLeaving),
    transitionProps: {
      ...fadeBaseTransitionProps,
      ...props.transitionProps,
      ...transitionFunctions
    },
    lazyLoadCompleted: /* @__PURE__ */ readonly(lazyLoadCompleted),
    markLazyLoadCompleted,
    contentShowing,
    backdropReady: /* @__PURE__ */ readonly(backdropReady),
    backdropVisible: /* @__PURE__ */ readonly(backdropVisible),
    backdropTransitionProps: {
      ...fadeBaseTransitionProps,
      onBeforeEnter: () => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            backdropVisible.value = true;
          });
        });
        backdropReady.value = false;
      },
      onAfterEnter: () => {
        backdropReady.value = true;
      },
      onBeforeLeave: () => {
        backdropVisible.value = false;
      },
      onAfterLeave: () => {
        backdropReady.value = false;
        requestAnimationFrame(() => {
          renderBackdropRef.value = false;
        });
      }
    }
  };
};
var _hoisted_1$b = [
  "type",
  "disabled",
  "aria-label"
];
var BCloseButton_default = /* @__PURE__ */ defineComponent({
  __name: "BCloseButton",
  props: {
    ariaLabel: { default: "Close" },
    disabled: {
      type: Boolean,
      default: false
    },
    type: { default: "button" }
  },
  emits: ["click"],
  setup(__props, { emit: __emit }) {
    const props = useDefaults(__props, "BCloseButton");
    const emit2 = __emit;
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("button", {
        type: unref(props).type,
        class: "btn-close",
        disabled: unref(props).disabled,
        "aria-label": unref(props).ariaLabel,
        onClick: _cache[0] || (_cache[0] = ($event) => emit2("click", $event))
      }, null, 8, _hoisted_1$b);
    };
  }
});
var useColorVariantClasses = (obj) => computed(() => {
  let props = toValue(obj);
  props = {
    variant: props.variant ?? null,
    bgVariant: props.bgVariant ?? null,
    textVariant: props.textVariant ?? null,
    borderVariant: props.borderVariant ?? null
  };
  return {
    [`text-bg-${props.variant}`]: props.variant !== null,
    [`text-${props.textVariant}`]: props.textVariant !== null,
    [`bg-${props.bgVariant}`]: props.bgVariant !== null,
    [`border-${props.borderVariant}`]: props.borderVariant !== null
  };
});
var pick = (objToPluck, keysToPluck) => [...keysToPluck].reduce((memo, prop) => {
  memo[prop] = objToPluck[prop];
  return memo;
}, {});
var get = (value, path, defaultValue) => {
  const segments = path.split(/[.[\]]/g);
  let current = value;
  for (const key of segments) {
    if (current === null) return defaultValue;
    if (current === void 0) return defaultValue;
    if (key.trim() === "") continue;
    current = current[key];
  }
  if (current === void 0) return defaultValue;
  return current;
};
var upperFirst = (str) => {
  const trim = str.trim();
  return trim.charAt(0).toUpperCase() + trim.slice(1);
};
var toPascalCase = (str) => str.replace(/-./g, (match) => match.charAt(1).toUpperCase()).replace(/\b\w/g, (match) => match.toUpperCase()).replace(/\s+/g, "");
var isLink = (props) => !!(props.href || props.to);
var useBLinkHelper = (props, pickProps) => {
  const pickPropsResolved = /* @__PURE__ */ readonly(/* @__PURE__ */ toRef(pickProps));
  const resolvedProps = /* @__PURE__ */ readonly(/* @__PURE__ */ toRef(props));
  const computedLink = computed(() => isLink(resolvedProps.value));
  return {
    computedLink,
    computedLinkProps: computed(() => computedLink.value ? pick(resolvedProps.value, pickPropsResolved.value ?? [
      "active",
      "activeClass",
      "disabled",
      "exactActiveClass",
      "href",
      "icon",
      "noRel",
      "opacity",
      "opacityHover",
      "noPrefetch",
      "prefetch",
      "prefetchOn",
      "prefetchedClass",
      "rel",
      "replace",
      "routerComponentName",
      "routerTag",
      "stretched",
      "target",
      "to",
      "underlineOffset",
      "underlineOffsetHover",
      "underlineOpacity",
      "underlineOpacityHover",
      "underlineVariant",
      "variant"
    ]) : {})
  };
};
var useBLinkTagResolver = ({ to, disabled, href, replace, routerComponentName }) => {
  var _a, _b, _c, _d, _e, _f, _g, _h;
  const instance = getCurrentInstance();
  const router = (_d = (_c = (_b = (_a = instance == null ? void 0 : instance.appContext) == null ? void 0 : _a.app) == null ? void 0 : _b.config) == null ? void 0 : _c.globalProperties) == null ? void 0 : _d.$router;
  const route = (_h = (_g = (_f = (_e = instance == null ? void 0 : instance.appContext) == null ? void 0 : _e.app) == null ? void 0 : _f.config) == null ? void 0 : _g.globalProperties) == null ? void 0 : _h.$route;
  const RouterLinkComponent = resolveDynamicComponent("RouterLink");
  const resolvedTo = computed(() => toValue(to) || "");
  const resolvedReplace = /* @__PURE__ */ readonly(/* @__PURE__ */ toRef(replace));
  const routerName = computed(() => {
    const routerComponent = toValue(routerComponentName);
    if (typeof routerComponent === "string") return toPascalCase(routerComponent);
    return routerComponent;
  });
  const useLink = typeof routerName.value !== "string" && "useLink" in routerName.value ? routerName.value.useLink : typeof RouterLinkComponent !== "string" && "useLink" in RouterLinkComponent ? RouterLinkComponent.useLink : null;
  const isNuxtLink = computed(() => {
    var _a2, _b2;
    return typeof ((_b2 = (_a2 = instance == null ? void 0 : instance.appContext) == null ? void 0 : _a2.app) == null ? void 0 : _b2.$nuxt) !== "undefined";
  });
  const isRouterLink = computed(() => routerName.value === "RouterLink");
  const tag = computed(() => {
    var _a2, _b2;
    if (toValue(disabled) || !resolvedTo.value) return "a";
    if (typeof routerName.value !== "string") return routerName.value;
    if (isRouterLink.value && typeof RouterLinkComponent !== "string") return RouterLinkComponent;
    return ((_b2 = (_a2 = instance == null ? void 0 : instance.appContext) == null ? void 0 : _a2.app) == null ? void 0 : _b2.component(routerName.value)) || "a";
  });
  const isNonStandardTag = computed(() => tag.value !== "a" && !isRouterLink.value && !isNuxtLink.value);
  const isOfRouterType = computed(() => isRouterLink.value || isNuxtLink.value);
  const linkProps = computed(() => ({
    to: resolvedTo.value,
    replace: resolvedReplace.value
  }));
  const _link = useLink == null ? void 0 : useLink({
    to: resolvedTo,
    replace: resolvedReplace
  });
  const link = computed(() => isOfRouterType.value && toValue(to) ? _link : null);
  return {
    isNonStandardTag,
    tag,
    isRouterLink,
    isNuxtLink,
    computedHref: computed(() => {
      var _a2;
      if (((_a2 = link.value) == null ? void 0 : _a2.href.value) && resolvedTo.value) return link.value.href.value;
      const toFallback = "#";
      const resolvedHref = toValue(href);
      if (resolvedHref) return resolvedHref;
      if (typeof resolvedTo.value === "string") return resolvedTo.value || toFallback;
      const stableTo = resolvedTo.value;
      if (stableTo !== void 0 && "path" in stableTo) return `${stableTo.path || ""}${stableTo.query ? `?${Object.keys(stableTo.query).map((e) => {
        var _a3;
        return `${e}=${(_a3 = stableTo.query) == null ? void 0 : _a3[e]}`;
      }).join("=")}` : ""}${!stableTo.hash || stableTo.hash.charAt(0) === "#" ? stableTo.hash || "" : `#${stableTo.hash}`}` || toFallback;
      return toFallback;
    }),
    routerName,
    router,
    route,
    link,
    linkProps
  };
};
var useLinkClasses = (linkProps) => computed(() => {
  const props = toValue(linkProps);
  return {
    [`link-${props.variant}`]: props.variant !== null,
    [`link-opacity-${props.opacity}`]: props.opacity !== void 0,
    [`link-opacity-${props.opacityHover}-hover`]: props.opacityHover !== void 0,
    [`link-underline-${props.underlineVariant}`]: props.underlineVariant !== null,
    [`link-offset-${props.underlineOffset}`]: props.underlineOffset !== void 0,
    [`link-offset-${props.underlineOffsetHover}-hover`]: props.underlineOffsetHover !== void 0,
    ["link-underline"]: props.underlineVariant === null && (props.underlineOpacity !== void 0 || props.underlineOpacityHover !== void 0),
    [`link-underline-opacity-${props.underlineOpacity}`]: props.underlineOpacity !== void 0,
    [`link-underline-opacity-${props.underlineOpacityHover}-hover`]: props.underlineOpacityHover !== void 0,
    "icon-link": props.icon === true
  };
});
var defaultActiveClass = "active";
var BLink_default = /* @__PURE__ */ defineComponent({
  __name: "BLink",
  props: {
    active: {
      type: Boolean,
      default: void 0
    },
    activeClass: { default: "router-link-active" },
    disabled: {
      type: Boolean,
      default: false
    },
    exactActiveClass: { default: "router-link-exact-active" },
    href: { default: void 0 },
    icon: {
      type: Boolean,
      default: false
    },
    noRel: {
      type: Boolean,
      default: false
    },
    opacity: { default: void 0 },
    opacityHover: { default: void 0 },
    prefetch: {
      type: Boolean,
      default: void 0
    },
    prefetchOn: { default: void 0 },
    noPrefetch: {
      type: Boolean,
      default: void 0
    },
    prefetchedClass: { default: void 0 },
    rel: { default: void 0 },
    replace: {
      type: Boolean,
      default: false
    },
    routerComponentName: { default: "router-link" },
    routerTag: { default: "a" },
    stretched: {
      type: Boolean,
      default: false
    },
    target: { default: void 0 },
    to: { default: void 0 },
    underlineOffset: { default: void 0 },
    underlineOffsetHover: { default: void 0 },
    underlineOpacity: { default: void 0 },
    underlineOpacityHover: { default: void 0 },
    underlineVariant: { default: null },
    variant: { default: null }
  },
  emits: ["click"],
  setup(__props, { emit: __emit }) {
    const props = useDefaults(__props, "BLink");
    const emit2 = __emit;
    const attrs = useAttrs();
    const { computedHref, tag, link, isNuxtLink, isRouterLink, linkProps, isNonStandardTag } = useBLinkTagResolver({
      routerComponentName: () => props.routerComponentName,
      disabled: () => props.disabled,
      to: () => props.to,
      replace: () => props.replace,
      href: () => props.href
    });
    const collapseData = inject(collapseInjectionKey, null);
    const navbarData = inject(navbarInjectionKey, null);
    const linkValueClasses = useLinkClasses(props);
    const computedClasses = computed(() => {
      var _a, _b;
      return [
        linkValueClasses.value,
        attrs.class,
        computedLinkClasses.value,
        {
          [defaultActiveClass]: props.active,
          [props.activeClass]: ((_a = link.value) == null ? void 0 : _a.isActive.value) || false,
          [props.exactActiveClass]: ((_b = link.value) == null ? void 0 : _b.isExactActive.value) || false,
          "stretched-link": props.stretched
        }
      ];
    });
    const computedLinkClasses = computed(() => ({
      [defaultActiveClass]: props.active,
      disabled: props.disabled
    }));
    const clicked = (e) => {
      var _a, _b, _c;
      if (props.disabled) {
        e.preventDefault();
        e.stopImmediatePropagation();
        return;
      }
      if (((_a = collapseData == null ? void 0 : collapseData.isNav) == null ? void 0 : _a.value) === true && navbarData === null || navbarData !== null && ((_b = navbarData.noAutoClose) == null ? void 0 : _b.value) !== true) (_c = collapseData == null ? void 0 : collapseData.hide) == null ? void 0 : _c.call(collapseData);
      emit2("click", e);
    };
    const computedRel = computed(() => props.target === "_blank" ? !props.rel && props.noRel ? "noopener" : props.rel : void 0);
    const computedTabIndex = computed(() => props.disabled ? "-1" : typeof attrs.tabindex === "undefined" ? null : attrs.tabindex);
    const nuxtSpecificProps = computed(() => ({
      ...props.noPrefetch ? { noPrefetch: props.noPrefetch } : { prefetch: props.prefetch },
      prefetchOn: props.prefetchOn,
      prefetchedClass: props.prefetchedClass,
      ...linkProps.value
    }));
    const computedSpecificProps = computed(() => ({
      ...isRouterLink.value ? linkProps.value : void 0,
      ...isNuxtLink.value || isNonStandardTag.value ? nuxtSpecificProps.value : void 0
    }));
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(unref(tag)), mergeProps({
        class: computedClasses.value,
        target: unref(props).target,
        href: unref(computedHref),
        rel: computedRel.value,
        tabindex: computedTabIndex.value,
        "aria-disabled": unref(props).disabled ? true : null
      }, computedSpecificProps.value, { onClick: _cache[0] || (_cache[0] = (e) => {
        var _a;
        clicked(e);
        (_a = unref(link)) == null ? void 0 : _a.navigate(e);
      }) }), {
        default: withCtx(() => [renderSlot(_ctx.$slots, "default")]),
        _: 3
      }, 16, [
        "class",
        "target",
        "href",
        "rel",
        "tabindex",
        "aria-disabled"
      ]);
    };
  }
});
var _hoisted_1$a = {
  key: 0,
  class: "visually-hidden"
};
var BSpinner_default = /* @__PURE__ */ defineComponent({
  __name: "BSpinner",
  props: {
    label: { default: void 0 },
    role: { default: "status" },
    small: {
      type: Boolean,
      default: false
    },
    tag: { default: "span" },
    type: { default: "border" },
    variant: { default: null }
  },
  setup(__props) {
    const props = useDefaults(__props, "BSpinner");
    const slots = useSlots();
    const colorClasses = useColorVariantClasses(computed(() => ({ textVariant: props.variant })));
    const computedClasses = computed(() => [
      `spinner-${props.type}`,
      colorClasses.value,
      { [`spinner-${props.type}-sm`]: props.small }
    ]);
    const hasLabelSlot = computed(() => !isEmptySlot(slots.label));
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(unref(props).tag), {
        class: normalizeClass(computedClasses.value),
        role: unref(props).label || hasLabelSlot.value ? unref(props).role : null,
        "aria-hidden": unref(props).label || hasLabelSlot.value ? null : true
      }, {
        default: withCtx(() => [unref(props).label || hasLabelSlot.value ? (openBlock(), createElementBlock("span", _hoisted_1$a, [renderSlot(_ctx.$slots, "label", {}, () => [createTextVNode(toDisplayString(unref(props).label), 1)])])) : createCommentVNode("", true)]),
        _: 3
      }, 8, [
        "class",
        "role",
        "aria-hidden"
      ]);
    };
  }
});
var BButton_default = /* @__PURE__ */ defineComponent({
  __name: "BButton",
  props: /* @__PURE__ */ mergeModels({
    loading: {
      type: Boolean,
      default: false
    },
    loadingFill: {
      type: Boolean,
      default: false
    },
    loadingText: { default: "Loading..." },
    pill: {
      type: Boolean,
      default: false
    },
    size: { default: void 0 },
    squared: {
      type: Boolean,
      default: false
    },
    tag: { default: "button" },
    type: { default: "button" },
    variant: { default: "secondary" },
    active: {
      type: Boolean,
      default: false
    },
    activeClass: { default: void 0 },
    disabled: {
      type: Boolean,
      default: void 0
    },
    exactActiveClass: { default: void 0 },
    href: { default: void 0 },
    icon: {
      type: Boolean,
      default: false
    },
    noRel: { type: Boolean },
    opacity: { default: void 0 },
    opacityHover: { default: void 0 },
    prefetch: { type: Boolean },
    prefetchOn: {},
    noPrefetch: { type: Boolean },
    prefetchedClass: {},
    rel: { default: void 0 },
    replace: {
      type: Boolean,
      default: void 0
    },
    routerComponentName: { default: void 0 },
    routerTag: { default: void 0 },
    stretched: {
      type: Boolean,
      default: false
    },
    target: { default: void 0 },
    to: { default: void 0 },
    underlineOffset: { default: void 0 },
    underlineOffsetHover: { default: void 0 },
    underlineOpacity: { default: void 0 },
    underlineOpacityHover: { default: void 0 },
    underlineVariant: { default: null }
  }, {
    "pressed": {
      type: Boolean,
      default: void 0
    },
    "pressedModifiers": {}
  }),
  emits: /* @__PURE__ */ mergeModels(["click"], ["update:pressed"]),
  setup(__props, { emit: __emit }) {
    const props = useDefaults(__props, "BButton");
    const emit2 = __emit;
    const element = useTemplateRef("_element");
    const pressedValue = useModel(__props, "pressed");
    const { computedLink, computedLinkProps } = useBLinkHelper(props, [
      "activeClass",
      "exactActiveClass",
      "replace",
      "routerComponentName",
      "routerTag",
      "noPrefetch",
      "prefetch",
      "prefetchOn",
      "prefetchedClass"
    ]);
    const isToggle = computed(() => typeof pressedValue.value === "boolean");
    const isButton = computed(() => props.tag === "button" && props.href === void 0 && props.to === void 0);
    const isBLink = computed(() => props.to !== void 0);
    const nonStandardTag = computed(() => props.href !== void 0 ? false : !isButton.value);
    const linkProps = computed(() => isBLink.value ? computedLinkProps.value : []);
    const computedAriaDisabled = computed(() => {
      if (props.href === "#" && props.disabled) return true;
      return nonStandardTag.value ? props.disabled : null;
    });
    const variantIsLinkType = computed(() => {
      var _a;
      return ((_a = props.variant) == null ? void 0 : _a.startsWith("link")) || false;
    });
    const variantIsLinkTypeSubset = computed(() => {
      var _a;
      return ((_a = props.variant) == null ? void 0 : _a.startsWith("link-")) || false;
    });
    const linkValueClasses = useLinkClasses(computed(() => {
      var _a;
      return { ...variantIsLinkType.value ? {
        icon: props.icon,
        opacity: props.opacity,
        opacityHover: props.opacityHover,
        underlineOffset: props.underlineOffset,
        underlineOffsetHover: props.underlineOffsetHover,
        underlineOpacity: props.underlineOpacity,
        underlineOpacityHover: props.underlineOpacityHover,
        underlineVariant: props.underlineVariant,
        variant: variantIsLinkTypeSubset.value === true ? (_a = props.variant) == null ? void 0 : _a.slice(5) : null
      } : void 0 };
    }));
    const computedClasses = computed(() => [variantIsLinkType.value === true && computedLink.value === false ? linkValueClasses.value : void 0, {
      [`btn-${props.size}`]: props.size !== void 0,
      [`btn-${props.variant}`]: props.variant !== null && variantIsLinkTypeSubset.value === false,
      "active": props.active || pressedValue.value,
      "rounded-pill": props.pill,
      "rounded-0": props.squared,
      "disabled": props.disabled
    }]);
    const computedTag = computed(() => isBLink.value ? BLink_default : props.href ? "a" : props.tag);
    const clicked = (e) => {
      if (props.disabled) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      emit2("click", e);
      if (isToggle.value) pressedValue.value = !pressedValue.value;
    };
    onKeyStroke([" ", "enter"], (e) => {
      var _a;
      if (props.href === "#") {
        e.preventDefault();
        (_a = element.value) == null ? void 0 : _a.click();
      }
    }, { target: element });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(computedTag.value), mergeProps({
        ref: "_element",
        class: "btn"
      }, linkProps.value, {
        class: computedClasses.value,
        "aria-disabled": computedAriaDisabled.value,
        "aria-pressed": isToggle.value ? pressedValue.value : null,
        autocomplete: isToggle.value ? "off" : null,
        disabled: isButton.value ? unref(props).disabled : null,
        href: unref(props).href,
        rel: unref(computedLink) ? unref(props).rel : null,
        role: nonStandardTag.value || unref(computedLink) ? "button" : null,
        target: unref(computedLink) ? unref(props).target : null,
        type: isButton.value ? unref(props).type : null,
        to: !isButton.value ? unref(props).to : null,
        onClick: clicked
      }), {
        default: withCtx(() => [unref(props).loading ? renderSlot(_ctx.$slots, "loading", { key: 0 }, () => [!unref(props).loadingFill ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [createTextVNode(toDisplayString(unref(props).loadingText), 1)], 64)) : createCommentVNode("", true), renderSlot(_ctx.$slots, "loading-spinner", {}, () => [createVNode(BSpinner_default, {
          small: unref(props).size !== "lg",
          label: unref(props).loadingFill ? unref(props).loadingText : void 0
        }, null, 8, ["small", "label"])])]) : renderSlot(_ctx.$slots, "default", { key: 1 })]),
        _: 3
      }, 16, [
        "class",
        "aria-disabled",
        "aria-pressed",
        "autocomplete",
        "disabled",
        "href",
        "rel",
        "role",
        "target",
        "type",
        "to"
      ]);
    };
  }
});
var ConditionalTeleport_default = /* @__PURE__ */ defineComponent({
  name: "ConditionalTeleport",
  inheritAttrs: false,
  props: {
    to: {
      type: [String, Object],
      default: null
    },
    disabled: {
      type: Boolean,
      required: true
    }
  },
  slots: Object,
  setup(props, { slots }) {
    return () => {
      var _a, _b;
      return !props.to ? (_a = slots.default) == null ? void 0 : _a.call(slots, {}) : h(Teleport, {
        to: props.to,
        disabled: props.disabled || !props.to
      }, [(_b = slots.default) == null ? void 0 : _b.call(slots, {})]);
    };
  }
});
var getElement = (element, root = getSafeDocument()) => {
  var _a;
  if (!element) return void 0;
  if (typeof element === "string") {
    if (root === null) return void 0;
    return ((_a = getSafeDocument()) == null ? void 0 : _a.getElementById(element)) ?? root.querySelector(element) ?? void 0;
  }
  return element.$el ?? element;
};
var useScrollLock = /* @__PURE__ */ createSharedComposable(useScrollLock$1);
/*!
* tabbable 6.4.0
* @license MIT, https://github.com/focus-trap/tabbable/blob/master/LICENSE
*/
var candidateSelectors = [
  "input:not([inert]):not([inert] *)",
  "select:not([inert]):not([inert] *)",
  "textarea:not([inert]):not([inert] *)",
  "a[href]:not([inert]):not([inert] *)",
  "button:not([inert]):not([inert] *)",
  "[tabindex]:not(slot):not([inert]):not([inert] *)",
  "audio[controls]:not([inert]):not([inert] *)",
  "video[controls]:not([inert]):not([inert] *)",
  '[contenteditable]:not([contenteditable="false"]):not([inert]):not([inert] *)',
  "details>summary:first-of-type:not([inert]):not([inert] *)",
  "details:not([inert]):not([inert] *)"
];
var candidateSelector = /* @__PURE__ */ candidateSelectors.join(",");
var NoElement = typeof Element === "undefined";
var matches = NoElement ? function() {
} : Element.prototype.matches || Element.prototype.msMatchesSelector || Element.prototype.webkitMatchesSelector;
var getRootNode = !NoElement && Element.prototype.getRootNode ? function(element) {
  var _element$getRootNode;
  return element === null || element === void 0 ? void 0 : (_element$getRootNode = element.getRootNode) === null || _element$getRootNode === void 0 ? void 0 : _element$getRootNode.call(element);
} : function(element) {
  return element === null || element === void 0 ? void 0 : element.ownerDocument;
};
var _isInert = function isInert(node, lookUp) {
  var _node$getAttribute;
  if (lookUp === void 0) lookUp = true;
  var inertAtt = node === null || node === void 0 ? void 0 : (_node$getAttribute = node.getAttribute) === null || _node$getAttribute === void 0 ? void 0 : _node$getAttribute.call(node, "inert");
  return inertAtt === "" || inertAtt === "true" || lookUp && node && (typeof node.closest === "function" ? node.closest("[inert]") : _isInert(node.parentNode));
};
var isContentEditable = function isContentEditable2(node) {
  var _node$getAttribute2;
  var attValue = node === null || node === void 0 ? void 0 : (_node$getAttribute2 = node.getAttribute) === null || _node$getAttribute2 === void 0 ? void 0 : _node$getAttribute2.call(node, "contenteditable");
  return attValue === "" || attValue === "true";
};
var getCandidates = function getCandidates2(el, includeContainer, filter) {
  if (_isInert(el)) return [];
  var candidates = Array.prototype.slice.apply(el.querySelectorAll(candidateSelector));
  if (includeContainer && matches.call(el, candidateSelector)) candidates.unshift(el);
  candidates = candidates.filter(filter);
  return candidates;
};
var _getCandidatesIteratively = function getCandidatesIteratively(elements, includeContainer, options) {
  var candidates = [];
  var elementsToCheck = Array.from(elements);
  while (elementsToCheck.length) {
    var element = elementsToCheck.shift();
    if (_isInert(element, false)) continue;
    if (element.tagName === "SLOT") {
      var assigned = element.assignedElements();
      var nestedCandidates = _getCandidatesIteratively(assigned.length ? assigned : element.children, true, options);
      if (options.flatten) candidates.push.apply(candidates, nestedCandidates);
      else candidates.push({
        scopeParent: element,
        candidates: nestedCandidates
      });
    } else {
      if (matches.call(element, candidateSelector) && options.filter(element) && (includeContainer || !elements.includes(element))) candidates.push(element);
      var shadowRoot = element.shadowRoot || typeof options.getShadowRoot === "function" && options.getShadowRoot(element);
      var validShadowRoot = !_isInert(shadowRoot, false) && (!options.shadowRootFilter || options.shadowRootFilter(element));
      if (shadowRoot && validShadowRoot) {
        var _nestedCandidates = _getCandidatesIteratively(shadowRoot === true ? element.children : shadowRoot.children, true, options);
        if (options.flatten) candidates.push.apply(candidates, _nestedCandidates);
        else candidates.push({
          scopeParent: element,
          candidates: _nestedCandidates
        });
      } else elementsToCheck.unshift.apply(elementsToCheck, element.children);
    }
  }
  return candidates;
};
var hasTabIndex = function hasTabIndex2(node) {
  return !isNaN(parseInt(node.getAttribute("tabindex"), 10));
};
var getTabIndex = function getTabIndex2(node) {
  if (!node) throw new Error("No node provided");
  if (node.tabIndex < 0) {
    if ((/^(AUDIO|VIDEO|DETAILS)$/.test(node.tagName) || isContentEditable(node)) && !hasTabIndex(node)) return 0;
  }
  return node.tabIndex;
};
var getSortOrderTabIndex = function getSortOrderTabIndex2(node, isScope) {
  var tabIndex = getTabIndex(node);
  if (tabIndex < 0 && isScope && !hasTabIndex(node)) return 0;
  return tabIndex;
};
var sortOrderedTabbables = function sortOrderedTabbables2(a, b) {
  return a.tabIndex === b.tabIndex ? a.documentOrder - b.documentOrder : a.tabIndex - b.tabIndex;
};
var isInput = function isInput2(node) {
  return node.tagName === "INPUT";
};
var isHiddenInput = function isHiddenInput2(node) {
  return isInput(node) && node.type === "hidden";
};
var isDetailsWithSummary = function isDetailsWithSummary2(node) {
  return node.tagName === "DETAILS" && Array.prototype.slice.apply(node.children).some(function(child) {
    return child.tagName === "SUMMARY";
  });
};
var getCheckedRadio = function getCheckedRadio2(nodes, form) {
  for (var i = 0; i < nodes.length; i++) if (nodes[i].checked && nodes[i].form === form) return nodes[i];
};
var isTabbableRadio = function isTabbableRadio2(node) {
  if (!node.name) return true;
  var radioScope = node.form || getRootNode(node);
  var queryRadios = function queryRadios2(name) {
    return radioScope.querySelectorAll('input[type="radio"][name="' + name + '"]');
  };
  var radioSet;
  if (typeof window !== "undefined" && typeof window.CSS !== "undefined" && typeof window.CSS.escape === "function") radioSet = queryRadios(window.CSS.escape(node.name));
  else try {
    radioSet = queryRadios(node.name);
  } catch (err) {
    console.error("Looks like you have a radio button with a name attribute containing invalid CSS selector characters and need the CSS.escape polyfill: %s", err.message);
    return false;
  }
  var checked = getCheckedRadio(radioSet, node.form);
  return !checked || checked === node;
};
var isRadio = function isRadio2(node) {
  return isInput(node) && node.type === "radio";
};
var isNonTabbableRadio = function isNonTabbableRadio2(node) {
  return isRadio(node) && !isTabbableRadio(node);
};
var isNodeAttached = function isNodeAttached2(node) {
  var _nodeRoot;
  var nodeRoot = node && getRootNode(node);
  var nodeRootHost = (_nodeRoot = nodeRoot) === null || _nodeRoot === void 0 ? void 0 : _nodeRoot.host;
  var attached = false;
  if (nodeRoot && nodeRoot !== node) {
    var _nodeRootHost, _nodeRootHost$ownerDo, _node$ownerDocument;
    attached = !!((_nodeRootHost = nodeRootHost) !== null && _nodeRootHost !== void 0 && (_nodeRootHost$ownerDo = _nodeRootHost.ownerDocument) !== null && _nodeRootHost$ownerDo !== void 0 && _nodeRootHost$ownerDo.contains(nodeRootHost) || node !== null && node !== void 0 && (_node$ownerDocument = node.ownerDocument) !== null && _node$ownerDocument !== void 0 && _node$ownerDocument.contains(node));
    while (!attached && nodeRootHost) {
      var _nodeRoot2, _nodeRootHost2, _nodeRootHost2$ownerD;
      nodeRoot = getRootNode(nodeRootHost);
      nodeRootHost = (_nodeRoot2 = nodeRoot) === null || _nodeRoot2 === void 0 ? void 0 : _nodeRoot2.host;
      attached = !!((_nodeRootHost2 = nodeRootHost) !== null && _nodeRootHost2 !== void 0 && (_nodeRootHost2$ownerD = _nodeRootHost2.ownerDocument) !== null && _nodeRootHost2$ownerD !== void 0 && _nodeRootHost2$ownerD.contains(nodeRootHost));
    }
  }
  return attached;
};
var isZeroArea = function isZeroArea2(node) {
  var _node$getBoundingClie = node.getBoundingClientRect(), width = _node$getBoundingClie.width, height = _node$getBoundingClie.height;
  return width === 0 && height === 0;
};
var isHidden = function isHidden2(node, _ref) {
  var displayCheck = _ref.displayCheck, getShadowRoot = _ref.getShadowRoot;
  if (displayCheck === "full-native") {
    if ("checkVisibility" in node) return !node.checkVisibility({
      checkOpacity: false,
      opacityProperty: false,
      contentVisibilityAuto: true,
      visibilityProperty: true,
      checkVisibilityCSS: true
    });
  }
  if (getComputedStyle(node).visibility === "hidden") return true;
  var nodeUnderDetails = matches.call(node, "details>summary:first-of-type") ? node.parentElement : node;
  if (matches.call(nodeUnderDetails, "details:not([open]) *")) return true;
  if (!displayCheck || displayCheck === "full" || displayCheck === "full-native" || displayCheck === "legacy-full") {
    if (typeof getShadowRoot === "function") {
      var originalNode = node;
      while (node) {
        var parentElement = node.parentElement;
        var rootNode = getRootNode(node);
        if (parentElement && !parentElement.shadowRoot && getShadowRoot(parentElement) === true) return isZeroArea(node);
        else if (node.assignedSlot) node = node.assignedSlot;
        else if (!parentElement && rootNode !== node.ownerDocument) node = rootNode.host;
        else node = parentElement;
      }
      node = originalNode;
    }
    if (isNodeAttached(node)) return !node.getClientRects().length;
    if (displayCheck !== "legacy-full") return true;
  } else if (displayCheck === "non-zero-area") return isZeroArea(node);
  return false;
};
var isDisabledFromFieldset = function isDisabledFromFieldset2(node) {
  if (/^(INPUT|BUTTON|SELECT|TEXTAREA)$/.test(node.tagName)) {
    var parentNode = node.parentElement;
    while (parentNode) {
      if (parentNode.tagName === "FIELDSET" && parentNode.disabled) {
        for (var i = 0; i < parentNode.children.length; i++) {
          var child = parentNode.children.item(i);
          if (child.tagName === "LEGEND") return matches.call(parentNode, "fieldset[disabled] *") ? true : !child.contains(node);
        }
        return true;
      }
      parentNode = parentNode.parentElement;
    }
  }
  return false;
};
var isNodeMatchingSelectorFocusable = function isNodeMatchingSelectorFocusable2(options, node) {
  if (node.disabled || isHiddenInput(node) || isHidden(node, options) || isDetailsWithSummary(node) || isDisabledFromFieldset(node)) return false;
  return true;
};
var isNodeMatchingSelectorTabbable = function isNodeMatchingSelectorTabbable2(options, node) {
  if (isNonTabbableRadio(node) || getTabIndex(node) < 0 || !isNodeMatchingSelectorFocusable(options, node)) return false;
  return true;
};
var isShadowRootTabbable = function isShadowRootTabbable2(shadowHostNode) {
  var tabIndex = parseInt(shadowHostNode.getAttribute("tabindex"), 10);
  if (isNaN(tabIndex) || tabIndex >= 0) return true;
  return false;
};
var _sortByOrder = function sortByOrder(candidates) {
  var regularTabbables = [];
  var orderedTabbables = [];
  candidates.forEach(function(item, i) {
    var isScope = !!item.scopeParent;
    var element = isScope ? item.scopeParent : item;
    var candidateTabindex = getSortOrderTabIndex(element, isScope);
    var elements = isScope ? _sortByOrder(item.candidates) : element;
    if (candidateTabindex === 0) isScope ? regularTabbables.push.apply(regularTabbables, elements) : regularTabbables.push(element);
    else orderedTabbables.push({
      documentOrder: i,
      tabIndex: candidateTabindex,
      item,
      isScope,
      content: elements
    });
  });
  return orderedTabbables.sort(sortOrderedTabbables).reduce(function(acc, sortable) {
    sortable.isScope ? acc.push.apply(acc, sortable.content) : acc.push(sortable.content);
    return acc;
  }, []).concat(regularTabbables);
};
var tabbable = function tabbable2(container, options) {
  options = options || {};
  var candidates;
  if (options.getShadowRoot) candidates = _getCandidatesIteratively([container], options.includeContainer, {
    filter: isNodeMatchingSelectorTabbable.bind(null, options),
    flatten: false,
    getShadowRoot: options.getShadowRoot,
    shadowRootFilter: isShadowRootTabbable
  });
  else candidates = getCandidates(container, options.includeContainer, isNodeMatchingSelectorTabbable.bind(null, options));
  return _sortByOrder(candidates);
};
var focusable = function focusable2(container, options) {
  options = options || {};
  var candidates;
  if (options.getShadowRoot) candidates = _getCandidatesIteratively([container], options.includeContainer, {
    filter: isNodeMatchingSelectorFocusable.bind(null, options),
    flatten: true,
    getShadowRoot: options.getShadowRoot
  });
  else candidates = getCandidates(container, options.includeContainer, isNodeMatchingSelectorFocusable.bind(null, options));
  return candidates;
};
var isTabbable = function isTabbable2(node, options) {
  options = options || {};
  if (!node) throw new Error("No node provided");
  if (matches.call(node, candidateSelector) === false) return false;
  return isNodeMatchingSelectorTabbable(options, node);
};
var focusableCandidateSelector = /* @__PURE__ */ candidateSelectors.concat("iframe:not([inert]):not([inert] *)").join(",");
var isFocusable = function isFocusable2(node, options) {
  options = options || {};
  if (!node) throw new Error("No node provided");
  if (matches.call(node, focusableCandidateSelector) === false) return false;
  return isNodeMatchingSelectorFocusable(options, node);
};
/*!
* focus-trap 8.0.1
* @license MIT, https://github.com/focus-trap/focus-trap/blob/master/LICENSE
*/
function _arrayLikeToArray(r, a) {
  (null == a || a > r.length) && (a = r.length);
  for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e];
  return n;
}
function _arrayWithoutHoles(r) {
  if (Array.isArray(r)) return _arrayLikeToArray(r);
}
function asyncGeneratorStep(n, t, e, r, o, a, c) {
  try {
    var i = n[a](c), u = i.value;
  } catch (n2) {
    e(n2);
    return;
  }
  i.done ? t(u) : Promise.resolve(u).then(r, o);
}
function _asyncToGenerator(n) {
  return function() {
    var t = this, e = arguments;
    return new Promise(function(r, o) {
      var a = n.apply(t, e);
      function _next(n2) {
        asyncGeneratorStep(a, r, o, _next, _throw, "next", n2);
      }
      function _throw(n2) {
        asyncGeneratorStep(a, r, o, _next, _throw, "throw", n2);
      }
      _next(void 0);
    });
  };
}
function _createForOfIteratorHelper(r, e) {
  var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"];
  if (!t) {
    if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e) {
      t && (r = t);
      var n = 0, F = function() {
      };
      return {
        s: F,
        n: function() {
          return n >= r.length ? { done: true } : {
            done: false,
            value: r[n++]
          };
        },
        e: function(r2) {
          throw r2;
        },
        f: F
      };
    }
    throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
  }
  var o, a = true, u = false;
  return {
    s: function() {
      t = t.call(r);
    },
    n: function() {
      var r2 = t.next();
      return a = r2.done, r2;
    },
    e: function(r2) {
      u = true, o = r2;
    },
    f: function() {
      try {
        a || null == t.return || t.return();
      } finally {
        if (u) throw o;
      }
    }
  };
}
function _defineProperty(e, r, t) {
  return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, {
    value: t,
    enumerable: true,
    configurable: true,
    writable: true
  }) : e[r] = t, e;
}
function _iterableToArray(r) {
  if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r);
}
function _nonIterableSpread() {
  throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method.");
}
function ownKeys(e, r) {
  var t = Object.keys(e);
  if (Object.getOwnPropertySymbols) {
    var o = Object.getOwnPropertySymbols(e);
    r && (o = o.filter(function(r2) {
      return Object.getOwnPropertyDescriptor(e, r2).enumerable;
    })), t.push.apply(t, o);
  }
  return t;
}
function _objectSpread2(e) {
  for (var r = 1; r < arguments.length; r++) {
    var t = null != arguments[r] ? arguments[r] : {};
    r % 2 ? ownKeys(Object(t), true).forEach(function(r2) {
      _defineProperty(e, r2, t[r2]);
    }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function(r2) {
      Object.defineProperty(e, r2, Object.getOwnPropertyDescriptor(t, r2));
    });
  }
  return e;
}
function _regenerator() {
  /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */
  var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag";
  function i(r2, n2, o2, i2) {
    var c2 = n2 && n2.prototype instanceof Generator ? n2 : Generator, u2 = Object.create(c2.prototype);
    return _regeneratorDefine(u2, "_invoke", (function(r3, n3, o3) {
      var i3, c3, u3, f2 = 0, p2 = o3 || [], y = false, G = {
        p: 0,
        n: 0,
        v: e,
        a: d,
        f: d.bind(e, 4),
        d: function(t2, r4) {
          return i3 = t2, c3 = 0, u3 = e, G.n = r4, a;
        }
      };
      function d(r4, n4) {
        for (c3 = r4, u3 = n4, t = 0; !y && f2 && !o4 && t < p2.length; t++) {
          var o4, i4 = p2[t], d2 = G.p, l = i4[2];
          r4 > 3 ? (o4 = l === n4) && (u3 = i4[(c3 = i4[4]) ? 5 : (c3 = 3, 3)], i4[4] = i4[5] = e) : i4[0] <= d2 && ((o4 = r4 < 2 && d2 < i4[1]) ? (c3 = 0, G.v = n4, G.n = i4[1]) : d2 < l && (o4 = r4 < 3 || i4[0] > n4 || n4 > l) && (i4[4] = r4, i4[5] = n4, G.n = l, c3 = 0));
        }
        if (o4 || r4 > 1) return a;
        throw y = true, n4;
      }
      return function(o4, p3, l) {
        if (f2 > 1) throw TypeError("Generator is already running");
        for (y && 1 === p3 && d(p3, l), c3 = p3, u3 = l; (t = c3 < 2 ? e : u3) || !y; ) {
          i3 || (c3 ? c3 < 3 ? (c3 > 1 && (G.n = -1), d(c3, u3)) : G.n = u3 : G.v = u3);
          try {
            if (f2 = 2, i3) {
              if (c3 || (o4 = "next"), t = i3[o4]) {
                if (!(t = t.call(i3, u3))) throw TypeError("iterator result is not an object");
                if (!t.done) return t;
                u3 = t.value, c3 < 2 && (c3 = 0);
              } else 1 === c3 && (t = i3.return) && t.call(i3), c3 < 2 && (u3 = TypeError("The iterator does not provide a '" + o4 + "' method"), c3 = 1);
              i3 = e;
            } else if ((t = (y = G.n < 0) ? u3 : r3.call(n3, G)) !== a) break;
          } catch (t2) {
            i3 = e, c3 = 1, u3 = t2;
          } finally {
            f2 = 1;
          }
        }
        return {
          value: t,
          done: y
        };
      };
    })(r2, o2, i2), true), u2;
  }
  var a = {};
  function Generator() {
  }
  function GeneratorFunction() {
  }
  function GeneratorFunctionPrototype() {
  }
  t = Object.getPrototypeOf;
  var c = [][n] ? t(t([][n]())) : (_regeneratorDefine(t = {}, n, function() {
    return this;
  }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c);
  function f(e2) {
    return Object.setPrototypeOf ? Object.setPrototypeOf(e2, GeneratorFunctionPrototype) : (e2.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine(e2, o, "GeneratorFunction")), e2.prototype = Object.create(u), e2;
  }
  return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine(u), _regeneratorDefine(u, o, "Generator"), _regeneratorDefine(u, n, function() {
    return this;
  }), _regeneratorDefine(u, "toString", function() {
    return "[object Generator]";
  }), (_regenerator = function() {
    return {
      w: i,
      m: f
    };
  })();
}
function _regeneratorDefine(e, r, n, t) {
  var i = Object.defineProperty;
  try {
    i({}, "", {});
  } catch (e2) {
    i = 0;
  }
  _regeneratorDefine = function(e2, r2, n2, t2) {
    function o(r3, n3) {
      _regeneratorDefine(e2, r3, function(e3) {
        return this._invoke(r3, n3, e3);
      });
    }
    r2 ? i ? i(e2, r2, {
      value: n2,
      enumerable: !t2,
      configurable: !t2,
      writable: !t2
    }) : e2[r2] = n2 : (o("next", 0), o("throw", 1), o("return", 2));
  }, _regeneratorDefine(e, r, n, t);
}
function _toConsumableArray(r) {
  return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread();
}
function _toPrimitive(t, r) {
  if ("object" != typeof t || !t) return t;
  var e = t[Symbol.toPrimitive];
  if (void 0 !== e) {
    var i = e.call(t, r);
    if ("object" != typeof i) return i;
    throw new TypeError("@@toPrimitive must return a primitive value.");
  }
  return ("string" === r ? String : Number)(t);
}
function _toPropertyKey(t) {
  var i = _toPrimitive(t, "string");
  return "symbol" == typeof i ? i : i + "";
}
function _unsupportedIterableToArray(r, a) {
  if (r) {
    if ("string" == typeof r) return _arrayLikeToArray(r, a);
    var t = {}.toString.call(r).slice(8, -1);
    return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0;
  }
}
var activeFocusTraps = {
  getActiveTrap: function getActiveTrap(trapStack) {
    if ((trapStack === null || trapStack === void 0 ? void 0 : trapStack.length) > 0) return trapStack[trapStack.length - 1];
    return null;
  },
  activateTrap: function activateTrap(trapStack, trap) {
    if (trap !== activeFocusTraps.getActiveTrap(trapStack)) activeFocusTraps.pauseTrap(trapStack);
    var trapIndex = trapStack.indexOf(trap);
    if (trapIndex === -1) trapStack.push(trap);
    else {
      trapStack.splice(trapIndex, 1);
      trapStack.push(trap);
    }
  },
  deactivateTrap: function deactivateTrap(trapStack, trap) {
    var trapIndex = trapStack.indexOf(trap);
    if (trapIndex !== -1) trapStack.splice(trapIndex, 1);
    activeFocusTraps.unpauseTrap(trapStack);
  },
  pauseTrap: function pauseTrap(trapStack) {
    var activeTrap = activeFocusTraps.getActiveTrap(trapStack);
    activeTrap === null || activeTrap === void 0 || activeTrap._setPausedState(true);
  },
  unpauseTrap: function unpauseTrap(trapStack) {
    var activeTrap = activeFocusTraps.getActiveTrap(trapStack);
    if (activeTrap && !activeTrap._isManuallyPaused()) activeTrap._setPausedState(false);
  }
};
var isSelectableInput = function isSelectableInput2(node) {
  return node.tagName && node.tagName.toLowerCase() === "input" && typeof node.select === "function";
};
var isEscapeEvent = function isEscapeEvent2(e) {
  return (e === null || e === void 0 ? void 0 : e.key) === "Escape" || (e === null || e === void 0 ? void 0 : e.key) === "Esc" || (e === null || e === void 0 ? void 0 : e.keyCode) === 27;
};
var isTabEvent = function isTabEvent2(e) {
  return (e === null || e === void 0 ? void 0 : e.key) === "Tab" || (e === null || e === void 0 ? void 0 : e.keyCode) === 9;
};
var isKeyForward = function isKeyForward2(e) {
  return isTabEvent(e) && !e.shiftKey;
};
var isKeyBackward = function isKeyBackward2(e) {
  return isTabEvent(e) && e.shiftKey;
};
var delay = function delay2(fn) {
  return setTimeout(fn, 0);
};
var valueOrHandler = function valueOrHandler2(value) {
  for (var _len = arguments.length, params = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) params[_key - 1] = arguments[_key];
  return typeof value === "function" ? value.apply(void 0, params) : value;
};
var getActualTarget = function getActualTarget2(event) {
  return event.target.shadowRoot && typeof event.composedPath === "function" ? event.composedPath()[0] : event.target;
};
var internalTrapStack = [];
var createFocusTrap = function createFocusTrap2(elements, userOptions) {
  var doc2 = (userOptions === null || userOptions === void 0 ? void 0 : userOptions.document) || document;
  var trapStack = (userOptions === null || userOptions === void 0 ? void 0 : userOptions.trapStack) || internalTrapStack;
  var config = _objectSpread2({
    returnFocusOnDeactivate: true,
    escapeDeactivates: true,
    delayInitialFocus: true,
    isolateSubtrees: false,
    isKeyForward,
    isKeyBackward
  }, userOptions);
  var state = {
    containers: [],
    containerGroups: [],
    tabbableGroups: [],
    adjacentElements: /* @__PURE__ */ new Set(),
    alreadySilent: /* @__PURE__ */ new Set(),
    nodeFocusedBeforeActivation: null,
    mostRecentlyFocusedNode: null,
    active: false,
    paused: false,
    manuallyPaused: false,
    delayInitialFocusTimer: void 0,
    recentNavEvent: void 0
  };
  var trap;
  var getOption = function getOption2(configOverrideOptions, optionName, configOptionName) {
    return configOverrideOptions && configOverrideOptions[optionName] !== void 0 ? configOverrideOptions[optionName] : config[configOptionName || optionName];
  };
  var findContainerIndex = function findContainerIndex2(element, event) {
    var composedPath = typeof (event === null || event === void 0 ? void 0 : event.composedPath) === "function" ? event.composedPath() : void 0;
    return state.containerGroups.findIndex(function(_ref) {
      var container = _ref.container, tabbableNodes = _ref.tabbableNodes;
      return container.contains(element) || (composedPath === null || composedPath === void 0 ? void 0 : composedPath.includes(container)) || tabbableNodes.find(function(node) {
        return node === element;
      });
    });
  };
  var getNodeForOption = function getNodeForOption2(optionName) {
    var _ref2 = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : {}, _ref2$hasFallback = _ref2.hasFallback, hasFallback = _ref2$hasFallback === void 0 ? false : _ref2$hasFallback, _ref2$params = _ref2.params, params = _ref2$params === void 0 ? [] : _ref2$params;
    var optionValue = config[optionName];
    if (typeof optionValue === "function") optionValue = optionValue.apply(void 0, _toConsumableArray(params));
    if (optionValue === true) optionValue = void 0;
    if (!optionValue) {
      if (optionValue === void 0 || optionValue === false) return optionValue;
      throw new Error("`".concat(optionName, "` was specified but was not a node, or did not return a node"));
    }
    var node = optionValue;
    if (typeof optionValue === "string") {
      try {
        node = doc2.querySelector(optionValue);
      } catch (err) {
        throw new Error("`".concat(optionName, '` appears to be an invalid selector; error="').concat(err.message, '"'));
      }
      if (!node) {
        if (!hasFallback) throw new Error("`".concat(optionName, "` as selector refers to no known node"));
      }
    }
    return node;
  };
  var getInitialFocusNode = function getInitialFocusNode2() {
    var node = getNodeForOption("initialFocus", { hasFallback: true });
    if (node === false) return false;
    if (node === void 0 || node && !isFocusable(node, config.tabbableOptions)) if (findContainerIndex(doc2.activeElement) >= 0) node = doc2.activeElement;
    else {
      var firstTabbableGroup = state.tabbableGroups[0];
      node = firstTabbableGroup && firstTabbableGroup.firstTabbableNode || getNodeForOption("fallbackFocus");
    }
    else if (node === null) node = getNodeForOption("fallbackFocus");
    if (!node) throw new Error("Your focus-trap needs to have at least one focusable element");
    return node;
  };
  var updateTabbableNodes = function updateTabbableNodes2() {
    state.containerGroups = state.containers.map(function(container) {
      var tabbableNodes = tabbable(container, config.tabbableOptions);
      var focusableNodes = focusable(container, config.tabbableOptions);
      var firstTabbableNode = tabbableNodes.length > 0 ? tabbableNodes[0] : void 0;
      var lastTabbableNode = tabbableNodes.length > 0 ? tabbableNodes[tabbableNodes.length - 1] : void 0;
      var firstDomTabbableNode = focusableNodes.find(function(node) {
        return isTabbable(node);
      });
      var lastDomTabbableNode = focusableNodes.slice().reverse().find(function(node) {
        return isTabbable(node);
      });
      return {
        container,
        tabbableNodes,
        focusableNodes,
        posTabIndexesFound: !!tabbableNodes.find(function(node) {
          return getTabIndex(node) > 0;
        }),
        firstTabbableNode,
        lastTabbableNode,
        firstDomTabbableNode,
        lastDomTabbableNode,
        nextTabbableNode: function nextTabbableNode(node) {
          var forward = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : true;
          var nodeIdx = tabbableNodes.indexOf(node);
          if (nodeIdx < 0) {
            if (forward) return focusableNodes.slice(focusableNodes.indexOf(node) + 1).find(function(el) {
              return isTabbable(el);
            });
            return focusableNodes.slice(0, focusableNodes.indexOf(node)).reverse().find(function(el) {
              return isTabbable(el);
            });
          }
          return tabbableNodes[nodeIdx + (forward ? 1 : -1)];
        }
      };
    });
    state.tabbableGroups = state.containerGroups.filter(function(group) {
      return group.tabbableNodes.length > 0;
    });
    if (state.tabbableGroups.length <= 0 && !getNodeForOption("fallbackFocus")) throw new Error("Your focus-trap must have at least one container with at least one tabbable node in it at all times");
    if (state.containerGroups.find(function(g) {
      return g.posTabIndexesFound;
    }) && state.containerGroups.length > 1) throw new Error("At least one node with a positive tabindex was found in one of your focus-trap's multiple containers. Positive tabindexes are only supported in single-container focus-traps.");
  };
  var _getActiveElement = function getActiveElement2(el) {
    var activeElement = el.activeElement;
    if (!activeElement) return;
    if (activeElement.shadowRoot && activeElement.shadowRoot.activeElement !== null) return _getActiveElement(activeElement.shadowRoot);
    return activeElement;
  };
  var _tryFocus = function tryFocus(node) {
    if (node === false) return;
    if (node === _getActiveElement(document)) return;
    if (!node || !node.focus) {
      _tryFocus(getInitialFocusNode());
      return;
    }
    node.focus({ preventScroll: !!config.preventScroll });
    state.mostRecentlyFocusedNode = node;
    if (isSelectableInput(node)) node.select();
  };
  var getReturnFocusNode = function getReturnFocusNode2(previousActiveElement) {
    var node = getNodeForOption("setReturnFocus", { params: [previousActiveElement] });
    return node ? node : node === false ? false : previousActiveElement;
  };
  var findNextNavNode = function findNextNavNode2(_ref3) {
    var target = _ref3.target, event = _ref3.event, _ref3$isBackward = _ref3.isBackward, isBackward = _ref3$isBackward === void 0 ? false : _ref3$isBackward;
    target = target || getActualTarget(event);
    updateTabbableNodes();
    var destinationNode = null;
    if (state.tabbableGroups.length > 0) {
      var containerIndex = findContainerIndex(target, event);
      var containerGroup = containerIndex >= 0 ? state.containerGroups[containerIndex] : void 0;
      if (containerIndex < 0) if (isBackward) destinationNode = state.tabbableGroups[state.tabbableGroups.length - 1].lastTabbableNode;
      else destinationNode = state.tabbableGroups[0].firstTabbableNode;
      else if (isBackward) {
        var startOfGroupIndex = state.tabbableGroups.findIndex(function(_ref4) {
          var firstTabbableNode = _ref4.firstTabbableNode;
          return target === firstTabbableNode;
        });
        if (startOfGroupIndex < 0 && (containerGroup.container === target || isFocusable(target, config.tabbableOptions) && !isTabbable(target, config.tabbableOptions) && !containerGroup.nextTabbableNode(target, false))) startOfGroupIndex = containerIndex;
        if (startOfGroupIndex >= 0) {
          var destinationGroupIndex = startOfGroupIndex === 0 ? state.tabbableGroups.length - 1 : startOfGroupIndex - 1;
          var destinationGroup = state.tabbableGroups[destinationGroupIndex];
          destinationNode = getTabIndex(target) >= 0 ? destinationGroup.lastTabbableNode : destinationGroup.lastDomTabbableNode;
        } else if (!isTabEvent(event)) destinationNode = containerGroup.nextTabbableNode(target, false);
      } else {
        var lastOfGroupIndex = state.tabbableGroups.findIndex(function(_ref5) {
          var lastTabbableNode = _ref5.lastTabbableNode;
          return target === lastTabbableNode;
        });
        if (lastOfGroupIndex < 0 && (containerGroup.container === target || isFocusable(target, config.tabbableOptions) && !isTabbable(target, config.tabbableOptions) && !containerGroup.nextTabbableNode(target))) lastOfGroupIndex = containerIndex;
        if (lastOfGroupIndex >= 0) {
          var _destinationGroupIndex = lastOfGroupIndex === state.tabbableGroups.length - 1 ? 0 : lastOfGroupIndex + 1;
          var _destinationGroup = state.tabbableGroups[_destinationGroupIndex];
          destinationNode = getTabIndex(target) >= 0 ? _destinationGroup.firstTabbableNode : _destinationGroup.firstDomTabbableNode;
        } else if (!isTabEvent(event)) destinationNode = containerGroup.nextTabbableNode(target);
      }
    } else destinationNode = getNodeForOption("fallbackFocus");
    return destinationNode;
  };
  var checkPointerDown = function checkPointerDown2(e) {
    if (findContainerIndex(getActualTarget(e), e) >= 0) return;
    if (valueOrHandler(config.clickOutsideDeactivates, e)) {
      trap.deactivate({ returnFocus: config.returnFocusOnDeactivate });
      return;
    }
    if (valueOrHandler(config.allowOutsideClick, e)) return;
    e.preventDefault();
  };
  var checkFocusIn = function checkFocusIn2(event) {
    var target = getActualTarget(event);
    var targetContained = findContainerIndex(target, event) >= 0;
    if (targetContained || target instanceof Document) {
      if (targetContained) state.mostRecentlyFocusedNode = target;
    } else {
      event.stopImmediatePropagation();
      var nextNode;
      var navAcrossContainers = true;
      if (state.mostRecentlyFocusedNode) {
        if (getTabIndex(state.mostRecentlyFocusedNode) > 0) {
          var mruContainerIdx = findContainerIndex(state.mostRecentlyFocusedNode);
          var tabbableNodes = state.containerGroups[mruContainerIdx].tabbableNodes;
          if (tabbableNodes.length > 0) {
            var mruTabIdx = tabbableNodes.findIndex(function(node) {
              return node === state.mostRecentlyFocusedNode;
            });
            if (mruTabIdx >= 0) {
              if (config.isKeyForward(state.recentNavEvent)) {
                if (mruTabIdx + 1 < tabbableNodes.length) {
                  nextNode = tabbableNodes[mruTabIdx + 1];
                  navAcrossContainers = false;
                }
              } else if (mruTabIdx - 1 >= 0) {
                nextNode = tabbableNodes[mruTabIdx - 1];
                navAcrossContainers = false;
              }
            }
          }
        } else if (!state.containerGroups.some(function(g) {
          return g.tabbableNodes.some(function(n) {
            return getTabIndex(n) > 0;
          });
        })) navAcrossContainers = false;
      } else navAcrossContainers = false;
      if (navAcrossContainers) nextNode = findNextNavNode({
        target: state.mostRecentlyFocusedNode,
        isBackward: config.isKeyBackward(state.recentNavEvent)
      });
      if (nextNode) _tryFocus(nextNode);
      else _tryFocus(state.mostRecentlyFocusedNode || getInitialFocusNode());
    }
    state.recentNavEvent = void 0;
  };
  var checkKeyNav = function checkKeyNav2(event) {
    var isBackward = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : false;
    state.recentNavEvent = event;
    var destinationNode = findNextNavNode({
      event,
      isBackward
    });
    if (destinationNode) {
      if (isTabEvent(event)) event.preventDefault();
      _tryFocus(destinationNode);
    }
  };
  var checkTabKey = function checkTabKey2(event) {
    if (config.isKeyForward(event) || config.isKeyBackward(event)) checkKeyNav(event, config.isKeyBackward(event));
  };
  var checkEscapeKey = function checkEscapeKey2(event) {
    if (isEscapeEvent(event) && valueOrHandler(config.escapeDeactivates, event) !== false) {
      event.preventDefault();
      trap.deactivate();
    }
  };
  var checkClick = function checkClick2(e) {
    if (findContainerIndex(getActualTarget(e), e) >= 0) return;
    if (valueOrHandler(config.clickOutsideDeactivates, e)) return;
    if (valueOrHandler(config.allowOutsideClick, e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };
  var addListeners = function addListeners2() {
    if (!state.active) return Promise.resolve();
    activeFocusTraps.activateTrap(trapStack, trap);
    var promise;
    if (config.delayInitialFocus) promise = new Promise(function(resolve2) {
      state.delayInitialFocusTimer = delay(function() {
        _tryFocus(getInitialFocusNode());
        resolve2();
      });
    });
    else {
      promise = Promise.resolve();
      _tryFocus(getInitialFocusNode());
    }
    doc2.addEventListener("focusin", checkFocusIn, true);
    doc2.addEventListener("mousedown", checkPointerDown, {
      capture: true,
      passive: false
    });
    doc2.addEventListener("touchstart", checkPointerDown, {
      capture: true,
      passive: false
    });
    doc2.addEventListener("click", checkClick, {
      capture: true,
      passive: false
    });
    doc2.addEventListener("keydown", checkTabKey, {
      capture: true,
      passive: false
    });
    doc2.addEventListener("keydown", checkEscapeKey);
    return promise;
  };
  var collectAdjacentElements = function collectAdjacentElements2(containers) {
    if (state.active && !state.paused) trap._setSubtreeIsolation(false);
    state.adjacentElements.clear();
    state.alreadySilent.clear();
    var containerAncestors = /* @__PURE__ */ new Set();
    var adjacentElements = /* @__PURE__ */ new Set();
    var _iterator = _createForOfIteratorHelper(containers), _step;
    try {
      for (_iterator.s(); !(_step = _iterator.n()).done; ) {
        var container = _step.value;
        containerAncestors.add(container);
        var insideShadowRoot = typeof ShadowRoot !== "undefined" && container.getRootNode() instanceof ShadowRoot;
        var current = container;
        while (current) {
          containerAncestors.add(current);
          var parent = current.parentElement;
          var siblings = [];
          if (parent) siblings = parent.children;
          else if (!parent && insideShadowRoot) {
            siblings = current.getRootNode().children;
            parent = current.getRootNode().host;
            insideShadowRoot = typeof ShadowRoot !== "undefined" && parent.getRootNode() instanceof ShadowRoot;
          }
          var _iterator2 = _createForOfIteratorHelper(siblings), _step2;
          try {
            for (_iterator2.s(); !(_step2 = _iterator2.n()).done; ) {
              var child = _step2.value;
              adjacentElements.add(child);
            }
          } catch (err) {
            _iterator2.e(err);
          } finally {
            _iterator2.f();
          }
          current = parent;
        }
      }
    } catch (err) {
      _iterator.e(err);
    } finally {
      _iterator.f();
    }
    containerAncestors.forEach(function(el) {
      adjacentElements["delete"](el);
    });
    state.adjacentElements = adjacentElements;
  };
  var removeListeners = function removeListeners2() {
    if (!state.active) return;
    doc2.removeEventListener("focusin", checkFocusIn, true);
    doc2.removeEventListener("mousedown", checkPointerDown, true);
    doc2.removeEventListener("touchstart", checkPointerDown, true);
    doc2.removeEventListener("click", checkClick, true);
    doc2.removeEventListener("keydown", checkTabKey, true);
    doc2.removeEventListener("keydown", checkEscapeKey);
    return trap;
  };
  var mutationObserver = typeof window !== "undefined" && "MutationObserver" in window ? new MutationObserver(function checkDomRemoval(mutations) {
    if (mutations.some(function(mutation) {
      return Array.from(mutation.removedNodes).some(function(node) {
        return node === state.mostRecentlyFocusedNode;
      });
    })) _tryFocus(getInitialFocusNode());
  }) : void 0;
  var updateObservedNodes = function updateObservedNodes2() {
    if (!mutationObserver) return;
    mutationObserver.disconnect();
    if (state.active && !state.paused) state.containers.map(function(container) {
      mutationObserver.observe(container, {
        subtree: true,
        childList: true
      });
    });
  };
  trap = {
    get active() {
      return state.active;
    },
    get paused() {
      return state.paused;
    },
    activate: function activate(activateOptions) {
      if (state.active) return this;
      var onActivate = getOption(activateOptions, "onActivate");
      var onPostActivate = getOption(activateOptions, "onPostActivate");
      var checkCanFocusTrap = getOption(activateOptions, "checkCanFocusTrap");
      var preexistingTrap = activeFocusTraps.getActiveTrap(trapStack);
      var revertState = false;
      if (preexistingTrap && !preexistingTrap.paused) {
        var _preexistingTrap$_set;
        (_preexistingTrap$_set = preexistingTrap._setSubtreeIsolation) === null || _preexistingTrap$_set === void 0 || _preexistingTrap$_set.call(preexistingTrap, false);
        revertState = true;
      }
      try {
        if (!checkCanFocusTrap) updateTabbableNodes();
        state.active = true;
        state.paused = false;
        state.nodeFocusedBeforeActivation = _getActiveElement(doc2);
        onActivate === null || onActivate === void 0 || onActivate();
        var finishActivation = /* @__PURE__ */ (function() {
          var _ref6 = _asyncToGenerator(/* @__PURE__ */ _regenerator().m(function _callee() {
            return _regenerator().w(function(_context) {
              while (1) switch (_context.n) {
                case 0:
                  if (checkCanFocusTrap) updateTabbableNodes();
                  _context.n = 1;
                  return addListeners();
                case 1:
                  trap._setSubtreeIsolation(true);
                  updateObservedNodes();
                  onPostActivate === null || onPostActivate === void 0 || onPostActivate();
                case 2:
                  return _context.a(2);
              }
            }, _callee);
          }));
          return function finishActivation2() {
            return _ref6.apply(this, arguments);
          };
        })();
        if (checkCanFocusTrap) {
          checkCanFocusTrap(state.containers.concat()).then(finishActivation, finishActivation);
          return this;
        }
        finishActivation();
      } catch (error) {
        if (preexistingTrap === activeFocusTraps.getActiveTrap(trapStack) && revertState) {
          var _preexistingTrap$_set2;
          (_preexistingTrap$_set2 = preexistingTrap._setSubtreeIsolation) === null || _preexistingTrap$_set2 === void 0 || _preexistingTrap$_set2.call(preexistingTrap, true);
        }
        throw error;
      }
      return this;
    },
    deactivate: function deactivate(deactivateOptions) {
      if (!state.active) return this;
      var options = _objectSpread2({
        onDeactivate: config.onDeactivate,
        onPostDeactivate: config.onPostDeactivate,
        checkCanReturnFocus: config.checkCanReturnFocus
      }, deactivateOptions);
      clearTimeout(state.delayInitialFocusTimer);
      state.delayInitialFocusTimer = void 0;
      if (!state.paused) trap._setSubtreeIsolation(false);
      state.alreadySilent.clear();
      removeListeners();
      state.active = false;
      state.paused = false;
      updateObservedNodes();
      activeFocusTraps.deactivateTrap(trapStack, trap);
      var onDeactivate = getOption(options, "onDeactivate");
      var onPostDeactivate = getOption(options, "onPostDeactivate");
      var checkCanReturnFocus = getOption(options, "checkCanReturnFocus");
      var returnFocus = getOption(options, "returnFocus", "returnFocusOnDeactivate");
      onDeactivate === null || onDeactivate === void 0 || onDeactivate();
      var finishDeactivation = function finishDeactivation2() {
        delay(function() {
          if (returnFocus) _tryFocus(getReturnFocusNode(state.nodeFocusedBeforeActivation));
          onPostDeactivate === null || onPostDeactivate === void 0 || onPostDeactivate();
        });
      };
      if (returnFocus && checkCanReturnFocus) {
        checkCanReturnFocus(getReturnFocusNode(state.nodeFocusedBeforeActivation)).then(finishDeactivation, finishDeactivation);
        return this;
      }
      finishDeactivation();
      return this;
    },
    pause: function pause(pauseOptions) {
      if (!state.active) return this;
      state.manuallyPaused = true;
      return this._setPausedState(true, pauseOptions);
    },
    unpause: function unpause(unpauseOptions) {
      if (!state.active) return this;
      state.manuallyPaused = false;
      if (trapStack[trapStack.length - 1] !== this) return this;
      return this._setPausedState(false, unpauseOptions);
    },
    updateContainerElements: function updateContainerElements(containerElements) {
      state.containers = [].concat(containerElements).filter(Boolean).map(function(element) {
        return typeof element === "string" ? doc2.querySelector(element) : element;
      });
      if (config.isolateSubtrees) collectAdjacentElements(state.containers);
      if (state.active) {
        updateTabbableNodes();
        if (!state.paused) trap._setSubtreeIsolation(true);
      }
      updateObservedNodes();
      return this;
    }
  };
  Object.defineProperties(trap, {
    _isManuallyPaused: { value: function value() {
      return state.manuallyPaused;
    } },
    _setPausedState: { value: function value(paused, options) {
      if (state.paused === paused) return this;
      state.paused = paused;
      if (paused) {
        var onPause = getOption(options, "onPause");
        var onPostPause = getOption(options, "onPostPause");
        onPause === null || onPause === void 0 || onPause();
        removeListeners();
        trap._setSubtreeIsolation(false);
        updateObservedNodes();
        onPostPause === null || onPostPause === void 0 || onPostPause();
      } else {
        var onUnpause = getOption(options, "onUnpause");
        var onPostUnpause = getOption(options, "onPostUnpause");
        onUnpause === null || onUnpause === void 0 || onUnpause();
        (/* @__PURE__ */ (function() {
          var _ref7 = _asyncToGenerator(/* @__PURE__ */ _regenerator().m(function _callee2() {
            return _regenerator().w(function(_context2) {
              while (1) switch (_context2.n) {
                case 0:
                  updateTabbableNodes();
                  _context2.n = 1;
                  return addListeners();
                case 1:
                  trap._setSubtreeIsolation(true);
                  updateObservedNodes();
                  onPostUnpause === null || onPostUnpause === void 0 || onPostUnpause();
                case 2:
                  return _context2.a(2);
              }
            }, _callee2);
          }));
          return function finishUnpause() {
            return _ref7.apply(this, arguments);
          };
        })())();
      }
      return this;
    } },
    _setSubtreeIsolation: { value: function value(isEnabled) {
      if (config.isolateSubtrees) state.adjacentElements.forEach(function(el) {
        var _el$getAttribute;
        if (isEnabled) switch (config.isolateSubtrees) {
          case "aria-hidden":
            if (el.ariaHidden === "true" || ((_el$getAttribute = el.getAttribute("aria-hidden")) === null || _el$getAttribute === void 0 ? void 0 : _el$getAttribute.toLowerCase()) === "true") state.alreadySilent.add(el);
            el.setAttribute("aria-hidden", "true");
            break;
          default:
            if (el.inert || el.hasAttribute("inert")) state.alreadySilent.add(el);
            el.setAttribute("inert", true);
            break;
        }
        else if (state.alreadySilent.has(el)) ;
        else switch (config.isolateSubtrees) {
          case "aria-hidden":
            el.removeAttribute("aria-hidden");
            break;
          default:
            el.removeAttribute("inert");
            break;
        }
      });
    } }
  });
  trap.updateContainerElements(elements);
  return trap;
};
function useFocusTrap(target, options = {}) {
  let trap;
  const { immediate, ...focusTrapOptions } = options;
  const hasFocus = /* @__PURE__ */ shallowRef(false);
  const isPaused = /* @__PURE__ */ shallowRef(false);
  const activate = (opts) => trap && trap.activate(opts);
  const deactivate = (opts) => trap && trap.deactivate(opts);
  const pause = () => {
    if (trap) {
      trap.pause();
      isPaused.value = true;
    }
  };
  const unpause = () => {
    if (trap) {
      trap.unpause();
      isPaused.value = false;
    }
  };
  watch(computed(() => {
    return toArray(toValue(target)).map((el) => {
      const _el = toValue(el);
      return typeof _el === "string" ? _el : unrefElement(_el);
    }).filter(notNullish);
  }), (els) => {
    if (!els.length) return;
    if (!trap) {
      trap = createFocusTrap(els, {
        ...focusTrapOptions,
        onActivate() {
          hasFocus.value = true;
          if (options.onActivate) options.onActivate();
        },
        onDeactivate() {
          hasFocus.value = false;
          if (options.onDeactivate) options.onDeactivate();
        }
      });
      if (immediate) activate();
    } else {
      const isActive = trap === null || trap === void 0 ? void 0 : trap.active;
      trap === null || trap === void 0 || trap.updateContainerElements(els);
      if (!isActive && immediate) activate();
    }
  }, { flush: "post" });
  tryOnScopeDispose(() => deactivate());
  return {
    hasFocus,
    isPaused,
    activate,
    deactivate,
    pause,
    unpause
  };
}
var useActivatedFocusTrap = ({ element, isActive, noTrap, fallbackFocus, focus }, focusTrapOpts = {
  allowOutsideClick: true,
  fallbackFocus: () => {
    var _a;
    return fallbackFocus.ref.value || ((_a = getSafeDocument()) == null ? void 0 : _a.body) || "body";
  },
  escapeDeactivates: false,
  clickOutsideDeactivates: false,
  initialFocus: focus,
  delayInitialFocus: false
}) => {
  const resolvedIsActive = /* @__PURE__ */ readonly(/* @__PURE__ */ toRef(isActive));
  const resolvedNoTrap = /* @__PURE__ */ readonly(/* @__PURE__ */ toRef(noTrap));
  const checkNeedsFallback = () => {
    var _a, _b;
    return !((_b = (_a = element.value) == null ? void 0 : _a.querySelectorAll(`a, button, input, select, textarea, [tabindex]:not([tabindex="-1"]):not(.${fallbackFocus.classSelector})`)) == null ? void 0 : _b.length);
  };
  const needsFallback = /* @__PURE__ */ ref(false);
  onMounted(() => {
    needsFallback.value = checkNeedsFallback();
    useMutationObserver(element, () => {
      needsFallback.value = checkNeedsFallback();
    }, {
      childList: true,
      subtree: true
    });
  });
  const trap = useFocusTrap(element, focusTrapOpts);
  watch(resolvedIsActive, async (newValue) => {
    if (newValue && resolvedNoTrap.value === false) trap.activate();
    else trap.deactivate();
  });
  watch(resolvedNoTrap, (newValue) => {
    if (newValue === true) trap.deactivate();
  });
  return { needsFallback: /* @__PURE__ */ readonly(needsFallback) };
};
var prevousRightPadding = "";
var lockRegistry = /* @__PURE__ */ new Map();
var useSafeScrollLock = (isOpen, bodyScroll) => {
  var _a;
  const resolvedIsOpen = /* @__PURE__ */ readonly(/* @__PURE__ */ toRef(isOpen));
  const id = useId();
  const inverseBodyScrollingValue = computed(() => !toValue(bodyScroll));
  const isLocked = useScrollLock(((_a = getSafeDocument()) == null ? void 0 : _a.body) ?? null, resolvedIsOpen.value && inverseBodyScrollingValue.value);
  onMounted(() => {
    if (getSafeDocument() === null) return;
    lockRegistry.set(id, false);
    watch([resolvedIsOpen, inverseBodyScrollingValue], ([modelVal, bodyVal]) => {
      var _a2;
      const doc2 = getSafeDocument();
      const scrollBarGap = (((_a2 = getSafeWindow()) == null ? void 0 : _a2.innerWidth) ?? 0) - ((doc2 == null ? void 0 : doc2.documentElement.clientWidth) ?? 0);
      const hasLocked = Array.from(lockRegistry.values()).some((val) => val === true);
      const myLocked = modelVal && bodyVal;
      lockRegistry.set(id, myLocked);
      if (myLocked && !hasLocked && !isLocked.value) {
        isLocked.value = true;
        if (scrollBarGap > 0 && doc2) {
          prevousRightPadding = doc2.body.style.paddingRight;
          doc2.body.style.paddingRight = `${scrollBarGap + prevousRightPadding}px`;
        }
      }
      const hasLockedAfter = Array.from(lockRegistry.values()).some((val) => val === true);
      if (hasLocked && !hasLockedAfter && doc2) {
        lockRegistry.set(id, false);
        isLocked.value = false;
        doc2.body.style.paddingRight = prevousRightPadding;
      }
    }, { immediate: true });
  });
  onUnmounted(() => {
    lockRegistry.delete(id);
    const hasLockedAfter = Array.from(lockRegistry.values()).some((val) => val === true);
    const doc2 = getSafeDocument();
    if (!hasLockedAfter && doc2) {
      doc2.body.style.paddingRight = prevousRightPadding;
      isLocked.value = false;
    }
  });
};
var modalOpenClassName = "modal-open";
var useSharedModalStack = () => {
  const modalManagerPlugin = inject(modalManagerKey, null);
  const dispose = (modal) => {
    modalManagerPlugin == null ? void 0 : modalManagerPlugin.removeStack(modal);
    modalManagerPlugin == null ? void 0 : modalManagerPlugin.removeRegistry(modal);
  };
  const updateHTMLAttrs = getSSRHandler("updateHTMLAttrs", (selector, attribute, value) => {
    var _a;
    const el = typeof selector !== "string" ? unrefElement(selector) : selector ? (_a = getSafeDocument()) == null ? void 0 : _a.querySelector(selector) : void 0;
    if (!el) return;
    if (attribute === "class") el.classList.toggle(modalOpenClassName, value === modalOpenClassName);
    else el.setAttribute(attribute, value);
  });
  tryOnScopeDispose(() => {
    if ((modalManagerPlugin == null ? void 0 : modalManagerPlugin.countStack.value) === 0) updateHTMLAttrs("body", "class", "");
  });
  watch(() => modalManagerPlugin == null ? void 0 : modalManagerPlugin.countStack.value, (newValue) => {
    if (newValue === void 0) return;
    updateHTMLAttrs("body", "class", newValue > 0 ? modalOpenClassName : "");
  });
  return {
    ...modalManagerPlugin,
    dispose
  };
};
var useModalManager = (modalOpen, initialValue) => {
  const { pushRegistry, pushStack, removeStack, stack: stack2, dispose, countStack } = useSharedModalStack();
  const currentModal = getCurrentInstance();
  if (!currentModal || currentModal.type.__name !== "BModal") throw new Error("useModalManager must only use in BModal component");
  pushRegistry == null ? void 0 : pushRegistry(currentModal);
  tryOnScopeDispose(() => {
    dispose(currentModal);
  });
  const setInStack = (newValue, oldValue) => {
    if (newValue) pushStack == null ? void 0 : pushStack(currentModal);
    else if (oldValue && !newValue) removeStack == null ? void 0 : removeStack(currentModal);
  };
  setInStack(initialValue, initialValue);
  watch(modalOpen, setInStack);
  return {
    activePosition: computed(() => stack2 == null ? void 0 : stack2.value.findIndex((el) => {
      var _a, _b;
      return toValue((_a = el.exposed) == null ? void 0 : _a.id) === toValue((_b = currentModal.exposed) == null ? void 0 : _b.id);
    })),
    activeModalCount: countStack,
    stackWithoutSelf: computed(() => (stack2 == null ? void 0 : stack2.value.filter((el) => {
      var _a, _b;
      return toValue((_a = el.exposed) == null ? void 0 : _a.id) !== toValue((_b = currentModal.exposed) == null ? void 0 : _b.id);
    })) ?? [])
  };
};
var _hoisted_1$9 = [
  "id",
  "aria-labelledby",
  "aria-describedby"
];
var _hoisted_2$4 = ["id"];
var fallbackClassSelector = "modal-fallback-focus";
var BModal_default = /* @__PURE__ */ defineComponent({
  inheritAttrs: false,
  __name: "BModal",
  props: /* @__PURE__ */ mergeModels({
    focus: {
      type: [
        String,
        Boolean,
        Object,
        null
      ],
      default: void 0
    },
    backdropFirst: {
      type: Boolean,
      default: false
    },
    body: { default: void 0 },
    bodyAttrs: { default: void 0 },
    bodyBgVariant: { default: null },
    bodyClass: { default: null },
    bodyScrolling: {
      type: Boolean,
      default: false
    },
    bodyTextVariant: { default: null },
    bodyVariant: { default: null },
    busy: {
      type: Boolean,
      default: false
    },
    buttonSize: { default: void 0 },
    cancelClass: { default: void 0 },
    cancelDisabled: {
      type: Boolean,
      default: false
    },
    cancelTitle: { default: "Cancel" },
    cancelVariant: { default: "secondary" },
    centered: {
      type: Boolean,
      default: false
    },
    contentClass: { default: void 0 },
    dialogClass: { default: void 0 },
    footerBgVariant: { default: null },
    footerBorderVariant: { default: null },
    footerClass: { default: void 0 },
    footerTextVariant: { default: null },
    footerVariant: { default: null },
    fullscreen: {
      type: [Boolean, String],
      default: false
    },
    headerAttrs: { default: void 0 },
    headerBgVariant: { default: null },
    headerBorderVariant: { default: null },
    headerClass: { default: void 0 },
    headerCloseClass: { default: void 0 },
    headerCloseLabel: { default: "Close" },
    headerCloseVariant: { default: "secondary" },
    headerTextVariant: { default: null },
    headerVariant: { default: null },
    noBackdrop: {
      type: Boolean,
      default: false
    },
    noFooter: {
      type: Boolean,
      default: false
    },
    noHeader: {
      type: Boolean,
      default: false
    },
    noHeaderClose: {
      type: Boolean,
      default: false
    },
    id: { default: void 0 },
    modalClass: { default: void 0 },
    noCloseOnBackdrop: {
      type: Boolean,
      default: false
    },
    noCloseOnEsc: {
      type: Boolean,
      default: false
    },
    noTrap: {
      type: Boolean,
      default: false
    },
    noStacking: { type: Boolean },
    okClass: { default: void 0 },
    okDisabled: {
      type: Boolean,
      default: false
    },
    okOnly: {
      type: Boolean,
      default: false
    },
    okTitle: { default: "OK" },
    okVariant: { default: "primary" },
    scrollable: {
      type: Boolean,
      default: false
    },
    size: { default: void 0 },
    title: { default: void 0 },
    titleClass: { default: void 0 },
    titleVisuallyHidden: {
      type: Boolean,
      default: false
    },
    titleTag: { default: "h5" },
    teleportDisabled: {
      type: Boolean,
      default: false
    },
    teleportTo: { default: "body" },
    initialAnimation: {
      type: Boolean,
      default: false
    },
    noAnimation: { type: Boolean },
    noFade: {
      type: Boolean,
      default: false
    },
    lazy: {
      type: Boolean,
      default: false
    },
    unmountLazy: {
      type: Boolean,
      default: false
    },
    show: {
      type: Boolean,
      default: false
    },
    transProps: { default: void 0 },
    visible: {
      type: Boolean,
      default: false
    }
  }, {
    "modelValue": {
      type: Boolean,
      default: false
    },
    "modelModifiers": {}
  }),
  emits: /* @__PURE__ */ mergeModels([
    "backdrop",
    "cancel",
    "close",
    "esc",
    "ok",
    "hide",
    "hide-prevented",
    "hidden",
    "show",
    "show-prevented",
    "shown",
    "toggle",
    "toggle-prevented"
  ], ["update:modelValue"]),
  setup(__props, { expose: __expose, emit: __emit }) {
    var _a;
    const props = useDefaults(__props, "BModal");
    const emit2 = __emit;
    const slots = useSlots();
    const computedId = useId$1(() => props.id, "modal");
    const modelValue = useModel(__props, "modelValue");
    const element = useTemplateRef("_element");
    const fallbackFocusElement = useTemplateRef("_fallbackFocusElement");
    const okButton = useTemplateRef("_okButton");
    const cancelButton = useTemplateRef("_cancelButton");
    const closeButton = useTemplateRef("_closeButton");
    const pickFocusItem = () => {
      if (props.focus && typeof props.focus !== "boolean") {
        if (props.focus === "ok") return okButton;
        else if (props.focus === "close") return closeButton;
        else if (props.focus === "cancel") return cancelButton;
        return getElement(props.focus, element.value ?? void 0) ?? element.value;
      }
      return element;
    };
    let activeElement = null;
    const onAfterEnter = () => {
      const doc2 = getSafeDocument();
      if (props.noTrap && props.focus !== false && doc2) {
        activeElement = doc2.activeElement;
        if (activeElement === element.value) activeElement = null;
        const el = unrefElement(pickFocusItem());
        if (!el) return;
        el == null ? void 0 : el.focus();
        if (el.tagName && el.tagName.toLowerCase() === "input" && typeof el.select === "function") el.select();
      }
    };
    const onAfterLeave = () => {
      if (props.noTrap && props.focus !== false && activeElement) {
        activeElement == null ? void 0 : activeElement.focus();
        activeElement = null;
      }
    };
    const { showRef, renderRef, renderBackdropRef, hide, show, toggle, computedNoAnimation, transitionProps, backdropTransitionProps, isLeaving, isVisible: isVisible2, trapActive, contentShowing, backdropReady, backdropVisible } = useShowHide(modelValue, props, emit2, element, computedId, { transitionProps: {
      onAfterEnter,
      onAfterLeave
    } });
    const { needsFallback } = useActivatedFocusTrap({
      element,
      isActive: trapActive,
      noTrap: () => props.noTrap,
      fallbackFocus: {
        ref: fallbackFocusElement,
        classSelector: fallbackClassSelector
      },
      focus: () => props.focus === false ? false : unrefElement(pickFocusItem()) ?? void 0
    });
    onKeyStroke("Escape", () => {
      hide("esc");
    }, {
      target: element,
      passive: true
    });
    useSafeScrollLock(showRef, () => props.bodyScrolling);
    const hasHeaderCloseSlot = computed(() => !isEmptySlot(slots["header-close"]));
    const modalDialogClasses = computed(() => [props.dialogClass, {
      "modal-fullscreen": props.fullscreen === true,
      [`modal-fullscreen-${props.fullscreen}-down`]: typeof props.fullscreen === "string",
      [`modal-${props.size}`]: props.size !== void 0,
      "modal-dialog-centered": props.centered,
      "modal-dialog-scrollable": props.scrollable
    }]);
    const bodyColorClasses = useColorVariantClasses(() => ({
      bgVariant: props.bodyBgVariant,
      textVariant: props.bodyTextVariant,
      variant: props.bodyVariant
    }));
    const bodyClasses = computed(() => [props.bodyClass, bodyColorClasses.value]);
    const headerColorClasses = useColorVariantClasses(() => ({
      bgVariant: props.headerBgVariant,
      textVariant: props.headerTextVariant,
      variant: props.headerVariant,
      borderVariant: props.headerBorderVariant
    }));
    const headerClasses = computed(() => [props.headerClass, headerColorClasses.value]);
    const headerCloseAttrs = computed(() => ({
      variant: hasHeaderCloseSlot.value ? props.headerCloseVariant : void 0,
      class: props.headerCloseClass
    }));
    const footerColorClasses = useColorVariantClasses(() => ({
      bgVariant: props.footerBgVariant,
      textVariant: props.footerTextVariant,
      variant: props.footerVariant,
      borderVariant: props.footerBorderVariant
    }));
    const footerClasses = computed(() => [props.footerClass, footerColorClasses.value]);
    const titleClasses = computed(() => [props.titleClass, { ["visually-hidden"]: props.titleVisuallyHidden }]);
    const disableCancel = computed(() => props.cancelDisabled || props.busy);
    const disableOk = computed(() => props.okDisabled || props.busy);
    const { activePosition, activeModalCount, stackWithoutSelf } = useModalManager(showRef, modelValue.value);
    const sharedClasses = computed(() => ({
      [`stack-position-${(activePosition == null ? void 0 : activePosition.value) ?? 0}`]: true,
      [`stack-inverse-position-${((activeModalCount == null ? void 0 : activeModalCount.value) ?? 1) - 1 - ((activePosition == null ? void 0 : activePosition.value) ?? 0)}`]: true
    }));
    watch(stackWithoutSelf, (newValue, oldValue) => {
      if (newValue.length > oldValue.length && showRef.value === true && props.noStacking) hide();
    });
    const defaultModalDialogZIndex = /* @__PURE__ */ ref(getModalZIndex(element.value ?? ((_a = getSafeDocument()) == null ? void 0 : _a.body)));
    onMounted(() => {
      watch(renderRef, (v) => {
        if (!v) return;
        nextTick(() => {
          if (!element.value) return;
          defaultModalDialogZIndex.value = getModalZIndex(element.value);
        });
      }, { immediate: true });
    });
    const computedZIndexNumber = computed(() => showRef.value || isLeaving.value ? defaultModalDialogZIndex.value - (((activeModalCount == null ? void 0 : activeModalCount.value) ?? 0) * 2 - ((activePosition == null ? void 0 : activePosition.value) ?? 0) * 2) : defaultModalDialogZIndex.value);
    const computedZIndex = computed(() => ({
      "z-index": computedZIndexNumber.value,
      "--b-position": (activePosition == null ? void 0 : activePosition.value) ?? 0,
      "--b-inverse-position": ((activeModalCount == null ? void 0 : activeModalCount.value) ?? 1) - 1 - ((activePosition == null ? void 0 : activePosition.value) ?? 0),
      "--b-count": (activeModalCount == null ? void 0 : activeModalCount.value) ?? 0
    }));
    const computedZIndexBackdrop = computed(() => ({
      "z-index": computedZIndexNumber.value - 1,
      "--b-position": (activePosition == null ? void 0 : activePosition.value) ?? 0,
      "--b-inverse-position": ((activeModalCount == null ? void 0 : activeModalCount.value) ?? 1) - 1 - ((activePosition == null ? void 0 : activePosition.value) ?? 0),
      "--b-count": (activeModalCount == null ? void 0 : activeModalCount.value) ?? 0
    }));
    const sharedSlots = computed(() => ({
      id: computedId.value,
      cancel: () => {
        hide("cancel");
      },
      close: () => {
        hide("close");
      },
      hide,
      show,
      toggle,
      ok: () => {
        hide("ok");
      },
      active: showRef.value,
      visible: showRef.value
    }));
    __expose({
      hide,
      id: computedId,
      show,
      toggle,
      visible: showRef
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(ConditionalTeleport_default, {
        to: unref(props).teleportTo,
        disabled: unref(props).teleportDisabled
      }, {
        default: withCtx(() => [unref(renderRef) || unref(contentShowing) ? (openBlock(), createBlock(Transition, mergeProps({ key: 0 }, unref(transitionProps), { appear: modelValue.value || unref(props).visible }), {
          default: withCtx(() => [withDirectives(createBaseVNode("div", mergeProps({
            id: unref(computedId),
            ref: "_element",
            class: ["modal", [unref(props).modalClass, {
              fade: !unref(computedNoAnimation),
              show: unref(isVisible2),
              ...sharedClasses.value
            }]],
            role: "dialog",
            "aria-labelledby": !unref(props).noHeader ? `${unref(computedId)}-label` : void 0,
            "aria-describedby": `${unref(computedId)}-body`,
            tabindex: "-1"
          }, _ctx.$attrs, {
            style: [computedZIndex.value, { "display": "block" }],
            onMousedown: _cache[4] || (_cache[4] = withModifiers(($event) => unref(hide)("backdrop"), ["left", "self"]))
          }), [createBaseVNode("div", { class: normalizeClass(["modal-dialog", modalDialogClasses.value]) }, [unref(contentShowing) ? (openBlock(), createElementBlock("div", {
            key: 0,
            class: normalizeClass(["modal-content", unref(props).contentClass])
          }, [
            !unref(props).noHeader ? (openBlock(), createElementBlock("div", mergeProps({
              key: 0,
              class: ["modal-header", headerClasses.value]
            }, unref(props).headerAttrs), [renderSlot(_ctx.$slots, "header", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [(openBlock(), createBlock(resolveDynamicComponent(unref(props).titleTag), {
              id: `${unref(computedId)}-label`,
              class: normalizeClass(["modal-title", titleClasses.value])
            }, {
              default: withCtx(() => [renderSlot(_ctx.$slots, "title", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [createTextVNode(toDisplayString(unref(props).title), 1)])]),
              _: 3
            }, 8, ["id", "class"])), !unref(props).noHeaderClose ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [hasHeaderCloseSlot.value ? (openBlock(), createBlock(BButton_default, mergeProps({
              key: 0,
              ref: "_closeButton"
            }, headerCloseAttrs.value, { onClick: _cache[0] || (_cache[0] = ($event) => unref(hide)("close")) }), {
              default: withCtx(() => [renderSlot(_ctx.$slots, "header-close", normalizeProps(guardReactiveProps(sharedSlots.value)))]),
              _: 3
            }, 16)) : (openBlock(), createBlock(BCloseButton_default, mergeProps({
              key: 1,
              ref: "_closeButton",
              "aria-label": unref(props).headerCloseLabel
            }, headerCloseAttrs.value, { onClick: _cache[1] || (_cache[1] = ($event) => unref(hide)("close")) }), null, 16, ["aria-label"]))], 64)) : createCommentVNode("", true)])], 16)) : createCommentVNode("", true),
            createBaseVNode("div", mergeProps({
              id: `${unref(computedId)}-body`,
              class: ["modal-body", bodyClasses.value]
            }, unref(props).bodyAttrs), [renderSlot(_ctx.$slots, "default", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [createTextVNode(toDisplayString(unref(props).body), 1)])], 16, _hoisted_2$4),
            !unref(props).noFooter ? (openBlock(), createElementBlock("div", {
              key: 1,
              class: normalizeClass(["modal-footer", footerClasses.value])
            }, [renderSlot(_ctx.$slots, "footer", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [renderSlot(_ctx.$slots, "cancel", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [!unref(props).okOnly ? (openBlock(), createBlock(BButton_default, {
              key: 0,
              ref: "_cancelButton",
              disabled: disableCancel.value,
              size: unref(props).buttonSize,
              variant: unref(props).cancelVariant,
              class: normalizeClass(unref(props).cancelClass),
              onClick: _cache[2] || (_cache[2] = ($event) => unref(hide)("cancel"))
            }, {
              default: withCtx(() => [createTextVNode(toDisplayString(unref(props).cancelTitle), 1)]),
              _: 1
            }, 8, [
              "disabled",
              "size",
              "variant",
              "class"
            ])) : createCommentVNode("", true)]), renderSlot(_ctx.$slots, "ok", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [createVNode(BButton_default, {
              ref: "_okButton",
              disabled: disableOk.value,
              size: unref(props).buttonSize,
              variant: unref(props).okVariant,
              class: normalizeClass(unref(props).okClass),
              onClick: _cache[3] || (_cache[3] = ($event) => unref(hide)("ok"))
            }, {
              default: withCtx(() => [createTextVNode(toDisplayString(unref(props).okTitle), 1)]),
              _: 1
            }, 8, [
              "disabled",
              "size",
              "variant",
              "class"
            ])])])], 2)) : createCommentVNode("", true)
          ], 2)) : createCommentVNode("", true)], 2), unref(needsFallback) ? (openBlock(), createElementBlock("div", {
            key: 0,
            ref: "_fallbackFocusElement",
            class: normalizeClass(fallbackClassSelector),
            tabindex: "0",
            style: {
              "width": "0",
              "height": "0",
              "overflow": "hidden"
            }
          }, null, 512)) : createCommentVNode("", true)], 16, _hoisted_1$9), [[vShow, unref(showRef) && (unref(backdropReady) && unref(props).backdropFirst || !unref(props).backdropFirst)]])]),
          _: 3
        }, 16, ["appear"])) : createCommentVNode("", true), !unref(props).noBackdrop ? renderSlot(_ctx.$slots, "backdrop", normalizeProps(mergeProps({ key: 1 }, sharedSlots.value)), () => [unref(renderBackdropRef) ? (openBlock(), createBlock(Transition, normalizeProps(mergeProps({ key: 0 }, unref(backdropTransitionProps))), {
          default: withCtx(() => [withDirectives(createBaseVNode("div", {
            class: normalizeClass(["modal-backdrop", {
              fade: !unref(computedNoAnimation),
              show: unref(backdropVisible) || unref(computedNoAnimation),
              ...sharedClasses.value
            }]),
            style: normalizeStyle(computedZIndexBackdrop.value),
            onClick: _cache[5] || (_cache[5] = ($event) => unref(hide)("backdrop"))
          }, null, 6), [[vShow, unref(showRef) || unref(isLeaving) && unref(props).backdropFirst && !unref(computedNoAnimation)]])]),
          _: 1
        }, 16)) : createCommentVNode("", true)]) : createCommentVNode("", true)]),
        _: 3
      }, 8, ["to", "disabled"]);
    };
  }
});
var __defProp2 = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __exportAll = (all, no_symbols) => {
  let target = {};
  for (var name in all) __defProp2(target, name, {
    get: all[name],
    enumerable: true
  });
  __defProp2(target, Symbol.toStringTag, { value: "Module" });
  return target;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
    key = keys[i];
    if (!__hasOwnProp.call(to, key) && key !== except) __defProp2(to, key, {
      get: ((k) => from[k]).bind(null, key),
      enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
    });
  }
  return to;
};
var __reExport = (target, mod, secondTarget) => (__copyProps(target, mod, "default"), secondTarget);
var BProgressBar_default = /* @__PURE__ */ defineComponent({
  __name: "BProgressBar",
  props: {
    animated: {
      type: Boolean,
      default: false
    },
    label: { default: void 0 },
    max: { default: void 0 },
    precision: { default: 0 },
    showProgress: {
      type: Boolean,
      default: false
    },
    showValue: {
      type: Boolean,
      default: false
    },
    striped: {
      type: Boolean,
      default: false
    },
    value: { default: 0 },
    variant: { default: null },
    bgVariant: { default: null },
    textVariant: { default: null }
  },
  setup(__props) {
    const props = useDefaults(__props, "BProgressBar");
    const parentData = inject(progressInjectionKey, null);
    const colorClasses = useColorVariantClasses(props);
    const computedClasses = computed(() => [colorClasses.value, {
      "progress-bar-animated": props.animated || (parentData == null ? void 0 : parentData.animated.value),
      "progress-bar-striped": props.striped || (parentData == null ? void 0 : parentData.striped.value) || props.animated || (parentData == null ? void 0 : parentData.animated.value)
    }]);
    const numberPrecision = /* @__PURE__ */ useToNumber(() => props.precision);
    const numberValue = /* @__PURE__ */ useToNumber(() => props.value);
    const numberMax = /* @__PURE__ */ useToNumber(() => props.max ?? NaN);
    const parentMaxNumber = /* @__PURE__ */ useToNumber(() => (parentData == null ? void 0 : parentData.max.value) ?? NaN);
    const computedLabel = computed(() => props.showValue || (parentData == null ? void 0 : parentData.showValue.value) ? numberValue.value.toFixed(numberPrecision.value) : props.showProgress || (parentData == null ? void 0 : parentData.showProgress.value) ? (numberValue.value * 100 / (numberMax.value || 100)).toFixed(numberPrecision.value) : props.label !== void 0 ? props.label : "");
    const computedWidth = computed(() => parentMaxNumber.value ? `${numberValue.value * 100 / parentMaxNumber.value}%` : numberMax.value ? `${numberValue.value * 100 / numberMax.value}%` : typeof props.value === "string" ? props.value : `${props.value}%`);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: normalizeClass(["progress-bar", computedClasses.value]),
        style: normalizeStyle({ width: computedWidth.value })
      }, [renderSlot(_ctx.$slots, "default", {}, () => [createTextVNode(toDisplayString(computedLabel.value), 1)])], 6);
    };
  }
});
var _hoisted_1$8 = ["aria-valuenow", "aria-valuemax"];
var BProgress_default = /* @__PURE__ */ defineComponent({
  __name: "BProgress",
  props: {
    height: { default: void 0 },
    animated: {
      type: Boolean,
      default: void 0
    },
    max: { default: 100 },
    precision: { default: void 0 },
    showProgress: {
      type: Boolean,
      default: void 0
    },
    showValue: {
      type: Boolean,
      default: void 0
    },
    striped: {
      type: Boolean,
      default: void 0
    },
    value: { default: void 0 },
    variant: { default: void 0 },
    bgVariant: { default: void 0 },
    textVariant: { default: void 0 }
  },
  setup(__props) {
    const props = useDefaults(__props, "BProgress");
    provide(progressInjectionKey, {
      animated: /* @__PURE__ */ toRef(() => props.animated),
      max: /* @__PURE__ */ toRef(() => props.max),
      showProgress: /* @__PURE__ */ toRef(() => props.showProgress),
      showValue: /* @__PURE__ */ toRef(() => props.showValue),
      striped: /* @__PURE__ */ toRef(() => props.striped)
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", {
        class: "progress",
        role: "progressbar",
        style: normalizeStyle({ height: unref(props).height }),
        "aria-valuenow": unref(props).value,
        "aria-valuemin": "0",
        "aria-valuemax": unref(props).max
      }, [renderSlot(_ctx.$slots, "default", {}, () => [createVNode(BProgressBar_default, {
        animated: unref(props).animated,
        max: unref(props).max,
        precision: unref(props).precision,
        "show-progress": unref(props).showProgress,
        "show-value": unref(props).showValue,
        striped: unref(props).striped,
        value: unref(props).value,
        variant: unref(props).variant,
        "text-variant": unref(props).textVariant,
        "bg-variant": unref(props).bgVariant
      }, null, 8, [
        "animated",
        "max",
        "precision",
        "show-progress",
        "show-value",
        "striped",
        "value",
        "variant",
        "text-variant",
        "bg-variant"
      ])])], 12, _hoisted_1$8);
    };
  }
});
var useCountdown = (length, interval, timestampOpts = {}) => {
  const resolvedLength = /* @__PURE__ */ readonly(/* @__PURE__ */ toRef(length));
  const isPaused = /* @__PURE__ */ ref(false);
  const target = /* @__PURE__ */ ref(Date.now() + resolvedLength.value);
  const { isActive, pause, resume, timestamp: timestamp2 } = useTimestamp({
    interval,
    controls: true,
    callback: (v) => {
      if (v >= target.value) {
        isPaused.value = false;
        pause();
      }
    },
    ...timestampOpts
  });
  watch(/* @__PURE__ */ useDocumentVisibility(), (newVisibility) => {
    if (newVisibility === "visible" && isActive.value && !isPaused.value) {
      if (Date.now() >= target.value) {
        isPaused.value = false;
        pause();
      }
    }
  });
  const value = computed(() => target.value - timestamp2.value);
  const restart = () => {
    target.value = Date.now() + resolvedLength.value;
    resume();
  };
  watch(resolvedLength, () => {
    if (resolvedLength.value > 0) restart();
  });
  const myPause = () => {
    isPaused.value = true;
    pause();
  };
  const myResume = () => {
    isPaused.value = false;
    const remainingTime = target.value - timestamp2.value;
    target.value = Date.now() + remainingTime;
    resume();
  };
  const stop2 = () => {
    pause();
    timestamp2.value = target.value;
    isPaused.value = false;
  };
  return {
    isActive: /* @__PURE__ */ readonly(isActive),
    isPaused: /* @__PURE__ */ readonly(isPaused),
    stop: stop2,
    pause: myPause,
    resume: myResume,
    restart,
    value
  };
};
var useCountdownHover = (element, { modelValueIgnoresHover, noHoverPause, noResumeOnHoverLeave }, actions) => {
  const isHovering = useElementHover(element);
  const onMouseEnter = () => {
    if (toValue(noHoverPause)) return;
    actions.pause();
  };
  const onMouseLeave = () => {
    if (toValue(noResumeOnHoverLeave)) return;
    actions.resume();
  };
  watch(isHovering, (newValue) => {
    if (toValue(modelValueIgnoresHover)) return;
    if (newValue) {
      onMouseEnter();
      return;
    }
    onMouseLeave();
  });
  return { isHovering };
};
var _hoisted_1$7 = [
  "id",
  "role",
  "aria-live",
  "aria-atomic"
];
var _hoisted_2$3 = {
  key: 1,
  class: "d-flex gap-2"
};
var BAlert_default = /* @__PURE__ */ defineComponent({
  __name: "BAlert",
  props: /* @__PURE__ */ mergeModels({
    alertClass: { default: void 0 },
    body: { default: void 0 },
    bodyClass: { default: void 0 },
    closeClass: { default: void 0 },
    closeContent: { default: void 0 },
    closeLabel: { default: "Close" },
    closeVariant: { default: "secondary" },
    dismissible: {
      type: Boolean,
      default: false
    },
    headerClass: { default: void 0 },
    headerTag: { default: "div" },
    id: { default: void 0 },
    interval: { default: "requestAnimationFrame" },
    isStatus: {
      type: Boolean,
      default: false
    },
    noHoverPause: {
      type: Boolean,
      default: false
    },
    noResumeOnHoverLeave: {
      type: Boolean,
      default: false
    },
    progressProps: { default: void 0 },
    showOnPause: {
      type: Boolean,
      default: true
    },
    title: { default: void 0 },
    variant: { default: "info" },
    bgVariant: { default: null },
    textVariant: { default: null },
    active: {
      type: Boolean,
      default: void 0
    },
    activeClass: { default: void 0 },
    disabled: {
      type: Boolean,
      default: void 0
    },
    exactActiveClass: { default: void 0 },
    href: { default: void 0 },
    icon: {
      type: Boolean,
      default: void 0
    },
    noRel: {
      type: Boolean,
      default: void 0
    },
    opacity: { default: void 0 },
    opacityHover: { default: void 0 },
    prefetch: { type: Boolean },
    prefetchOn: {},
    noPrefetch: { type: Boolean },
    prefetchedClass: {},
    rel: { default: void 0 },
    replace: {
      type: Boolean,
      default: void 0
    },
    routerComponentName: { default: void 0 },
    stretched: {
      type: Boolean,
      default: false
    },
    target: { default: void 0 },
    to: { default: void 0 },
    underlineOffset: { default: void 0 },
    underlineOffsetHover: { default: void 0 },
    underlineOpacity: { default: void 0 },
    underlineOpacityHover: { default: void 0 },
    underlineVariant: { default: void 0 },
    initialAnimation: {
      type: Boolean,
      default: false
    },
    noAnimation: { type: Boolean },
    noFade: {
      type: Boolean,
      default: false
    },
    lazy: {
      type: Boolean,
      default: false
    },
    unmountLazy: {
      type: Boolean,
      default: false
    },
    show: {
      type: Boolean,
      default: false
    },
    transProps: { default: void 0 },
    visible: {
      type: Boolean,
      default: false
    }
  }, {
    "modelValue": {
      type: [Boolean, Number],
      default: false
    },
    "modelModifiers": {}
  }),
  emits: /* @__PURE__ */ mergeModels([
    "close",
    "close-countdown",
    "hide",
    "hide-prevented",
    "hidden",
    "show",
    "show-prevented",
    "shown",
    "toggle",
    "toggle-prevented"
  ], ["update:modelValue"]),
  setup(__props, { expose: __expose, emit: __emit }) {
    const props = useDefaults(__props, "BAlert");
    const emit2 = __emit;
    const slots = useSlots();
    const element = useTemplateRef("_element");
    const modelValue = useModel(__props, "modelValue");
    const { computedLink, computedLinkProps } = useBLinkHelper(props);
    const computedId = useId$1(() => props.id, "alert");
    const { showRef, renderRef, hide, toggle, show, buildTriggerableEvent, computedNoAnimation, isVisible: isVisible2, transitionProps, contentShowing } = useShowHide(modelValue, props, emit2, element, computedId);
    const { isActive, pause, restart, resume, stop: stop2, isPaused, value: remainingMs } = useCountdown(computed(() => typeof modelValue.value === "boolean" ? 0 : modelValue.value), props.interval, { immediate: typeof modelValue.value === "number" && !!modelValue.value });
    useCountdownHover(element, {
      noHoverPause: () => props.noHoverPause || typeof modelValue.value !== "number",
      noResumeOnHoverLeave: () => props.noResumeOnHoverLeave || typeof modelValue.value !== "number",
      modelValueIgnoresHover: () => typeof modelValue.value === "boolean"
    }, {
      pause,
      resume
    });
    watchEffect(() => {
      emit2("close-countdown", remainingMs.value);
    });
    const computedTag = computed(() => computedLink.value ? BLink_default : "div");
    const isAlertVisible = computed(() => showRef.value || isActive.value || props.showOnPause && isPaused.value);
    const computedClasses = computed(() => [{
      [`alert-${props.variant}`]: props.variant !== null,
      "alert-dismissible": props.dismissible && !(slots.close || props.closeContent),
      "show": isVisible2.value,
      "fade": !computedNoAnimation.value
    }]);
    watch(modelValue, (newValue) => {
      if (typeof newValue === "number") {
        const event = buildTriggerableEvent("show", {
          cancelable: true,
          trigger: "model"
        });
        emit2("show", event);
        if (event.defaultPrevented) emit2("show-prevented", buildTriggerableEvent("show-prevented"));
        else restart();
      }
    });
    watch(isActive, (newValue) => {
      if (newValue === false && isPaused.value === false) {
        hide();
        modelValue.value = 0;
        stop2();
      }
    });
    const sharedSlots = computed(() => ({
      toggle,
      show,
      hide,
      id: computedId.value,
      visible: showRef.value,
      active: isActive.value
    }));
    __expose({
      show,
      hide,
      toggle,
      pause,
      restart,
      resume,
      stop: stop2
    });
    return (_ctx, _cache) => {
      return unref(renderRef) || unref(contentShowing) ? (openBlock(), createBlock(Transition, mergeProps({ key: 0 }, unref(transitionProps), { appear: !!modelValue.value || unref(props).visible }), {
        default: withCtx(() => [withDirectives(createBaseVNode("div", {
          id: unref(props).id,
          ref: "_element",
          class: normalizeClass(["alert", [unref(props).alertClass, computedClasses.value]]),
          tabindex: "0",
          role: !isAlertVisible.value ? void 0 : unref(props).isStatus ? "status" : "alert",
          "aria-live": !isAlertVisible.value ? void 0 : unref(props).isStatus ? "polite" : "assertive",
          "aria-atomic": !isAlertVisible.value ? void 0 : true
        }, [
          unref(contentShowing) && (slots.title || unref(props).title) ? (openBlock(), createBlock(resolveDynamicComponent(unref(props).headerTag), {
            key: 0,
            class: normalizeClass(["alert-heading d-flex gap-2", unref(props).headerClass])
          }, {
            default: withCtx(() => [renderSlot(_ctx.$slots, "title", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [createBaseVNode("span", null, toDisplayString(unref(props).title), 1)]), unref(props).dismissible ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [slots.close || unref(props).closeContent ? (openBlock(), createBlock(BButton_default, {
              key: 0,
              class: normalizeClass([[unref(props).closeClass], "ms-auto ps-1 btn-close-custom"]),
              variant: unref(props).closeVariant,
              onClick: _cache[0] || (_cache[0] = withModifiers(($event) => unref(hide)("close"), ["stop", "prevent"]))
            }, {
              default: withCtx(() => [renderSlot(_ctx.$slots, "close", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [createTextVNode(toDisplayString(unref(props).closeContent), 1)])]),
              _: 3
            }, 8, ["class", "variant"])) : (openBlock(), createBlock(BCloseButton_default, {
              key: 1,
              "aria-label": unref(props).closeLabel,
              class: normalizeClass([unref(props).closeClass]),
              onClick: _cache[1] || (_cache[1] = withModifiers(($event) => unref(hide)("close"), ["stop", "prevent"]))
            }, null, 8, ["aria-label", "class"]))], 64)) : createCommentVNode("", true)]),
            _: 3
          }, 8, ["class"])) : createCommentVNode("", true),
          unref(contentShowing) && (slots.default || unref(props).body) ? (openBlock(), createElementBlock("div", _hoisted_2$3, [(openBlock(), createBlock(resolveDynamicComponent(computedTag.value), mergeProps({ class: ["alert-body", unref(props).bodyClass] }, unref(computedLinkProps), { onClick: _cache[2] || (_cache[2] = ($event) => unref(computedLink) && unref(props).dismissible ? unref(hide)() : () => {
          }) }), {
            default: withCtx(() => [renderSlot(_ctx.$slots, "default", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [createTextVNode(toDisplayString(unref(props).body), 1)])]),
            _: 3
          }, 16, ["class"])), unref(props).dismissible && !(slots.title || unref(props).title) ? (openBlock(), createElementBlock(Fragment, { key: 0 }, [slots.close || unref(props).closeContent ? (openBlock(), createBlock(BButton_default, {
            key: 0,
            class: normalizeClass([[unref(props).closeClass], "ms-auto btn-close-custom"]),
            variant: unref(props).closeVariant,
            onClick: _cache[3] || (_cache[3] = withModifiers(($event) => unref(hide)("close"), ["stop", "prevent"]))
          }, {
            default: withCtx(() => [renderSlot(_ctx.$slots, "close", normalizeProps(guardReactiveProps(sharedSlots.value)), () => [createTextVNode(toDisplayString(unref(props).closeContent), 1)])]),
            _: 3
          }, 8, ["class", "variant"])) : (openBlock(), createBlock(BCloseButton_default, {
            key: 1,
            "aria-label": unref(props).closeLabel,
            class: normalizeClass([unref(props).closeClass]),
            onClick: _cache[4] || (_cache[4] = withModifiers(($event) => unref(hide)("close"), ["stop", "prevent"]))
          }, null, 8, ["aria-label", "class"]))], 64)) : createCommentVNode("", true)])) : createCommentVNode("", true),
          typeof modelValue.value === "number" && unref(props).progressProps !== void 0 ? (openBlock(), createBlock(BProgress_default, {
            key: 2,
            animated: unref(props).progressProps.animated,
            precision: unref(props).progressProps.precision,
            "show-progress": unref(props).progressProps.showProgress,
            "show-value": unref(props).progressProps.showValue,
            striped: unref(props).progressProps.striped,
            variant: unref(props).progressProps.variant,
            max: modelValue.value,
            value: unref(remainingMs),
            height: "4px"
          }, null, 8, [
            "animated",
            "precision",
            "show-progress",
            "show-value",
            "striped",
            "variant",
            "max",
            "value"
          ])) : createCommentVNode("", true)
        ], 10, _hoisted_1$7), [[vShow, isAlertVisible.value]])]),
        _: 3
      }, 16, ["appear"])) : createCommentVNode("", true);
    };
  }
});
var createGetActive = (instances) => () => instances.length > 0 ? instances[instances.length - 1] : void 0;
var _newShowHideRegistry = () => {
  const values = /* @__PURE__ */ ref(/* @__PURE__ */ new Map());
  const register = ({ id, component, value, toggle, show, hide, registerTrigger, unregisterTrigger }) => {
    let currentId = id;
    const instanceValue = {
      id,
      component,
      value: /* @__PURE__ */ readonly(value),
      toggle,
      show,
      hide,
      registerTrigger,
      unregisterTrigger
    };
    let instancesHolder = values.value.get(currentId);
    if (!instancesHolder) {
      const instances = [];
      instancesHolder = {
        instances,
        getActive: createGetActive(instances)
      };
      values.value.set(currentId, instancesHolder);
    }
    instancesHolder.instances.push(instanceValue);
    const componentUid = component.uid;
    return {
      unregister() {
        const holder = values.value.get(currentId);
        if (!holder) return;
        const index = holder.instances.findIndex((inst) => inst.component.uid === componentUid);
        if (index !== -1) holder.instances.splice(index, 1);
        if (holder.instances.length === 0) values.value.delete(currentId);
      },
      updateId(newId, oldId) {
        const holder = values.value.get(oldId);
        if (!holder) return;
        const instance = holder.instances.find((inst) => inst.component.uid === componentUid);
        if (!instance) return;
        instance.id = newId;
        let newHolder = values.value.get(newId);
        if (!newHolder) {
          const instances = [];
          newHolder = {
            instances,
            getActive: createGetActive(instances)
          };
          values.value.set(newId, newHolder);
        }
        const index = holder.instances.findIndex((inst) => inst.component.uid === componentUid);
        if (index !== -1) {
          holder.instances.splice(index, 1);
          newHolder.instances.push(instance);
        }
        if (holder.instances.length === 0) values.value.delete(oldId);
        currentId = newId;
      }
    };
  };
  return {
    register,
    values
  };
};
var lib_exports = /* @__PURE__ */ __exportAll({
  Vue: () => vue,
  Vue2: () => void 0,
  del: () => del,
  install: () => install,
  isVue2: () => false,
  isVue3: () => true,
  set: () => set
});
__reExport(lib_exports, vue);
function install() {
}
function set(target, key, val) {
  if (Array.isArray(target)) {
    target.length = Math.max(target.length, key);
    target.splice(key, 1, val);
    return val;
  }
  target[key] = val;
  return val;
}
function del(target, key) {
  if (Array.isArray(target)) {
    target.splice(key, 1);
    return;
  }
  delete target[key];
}
var useAriaInvalid = (ariaInvalid, state) => computed(() => {
  const resolvedAriaInvalid = toValue(ariaInvalid);
  const resolvedState = toValue(state);
  return resolvedAriaInvalid === true ? "true" : typeof resolvedAriaInvalid === "string" ? resolvedAriaInvalid : resolvedState === false ? "true" : resolvedAriaInvalid === false ? "false" : void 0;
});
function createFilterWrapper(filter, fn) {
  function wrapper(...args) {
    return new Promise((resolve2, reject) => {
      Promise.resolve(filter(() => fn.apply(this, args), {
        fn,
        thisArg: this,
        args
      })).then(resolve2).catch(reject);
    });
  }
  wrapper.cancel = filter.cancel;
  return wrapper;
}
function debounceFilter(ms, options = {}) {
  let timer;
  let maxTimer;
  let lastRejector = noop;
  const _clearTimeout = (timer2) => {
    clearTimeout(timer2);
    lastRejector();
    lastRejector = noop;
  };
  let lastInvoker;
  const filter = (invoke) => {
    const duration = toValue(ms);
    const maxDuration = toValue(options.maxWait);
    if (timer) _clearTimeout(timer);
    if (duration <= 0 || maxDuration !== void 0 && maxDuration <= 0) {
      if (maxTimer) {
        _clearTimeout(maxTimer);
        maxTimer = null;
      }
      return Promise.resolve(invoke());
    }
    return new Promise((resolve2, reject) => {
      lastRejector = options.rejectOnCancel ? reject : resolve2;
      lastInvoker = invoke;
      if (maxDuration && !maxTimer) maxTimer = setTimeout(() => {
        if (timer) _clearTimeout(timer);
        maxTimer = null;
        resolve2(lastInvoker());
      }, maxDuration);
      timer = setTimeout(() => {
        if (maxTimer) _clearTimeout(maxTimer);
        maxTimer = null;
        resolve2(invoke());
      }, duration);
    });
  };
  filter.cancel = () => {
    if (timer) _clearTimeout(timer);
    if (maxTimer) _clearTimeout(maxTimer);
    maxTimer = null;
  };
  return filter;
}
function useDebounceFn(fn, ms = 200, options = {}) {
  return createFilterWrapper(debounceFilter(ms, options), fn);
}
var useStateClass = (value) => computed(() => {
  const resolvedValue = toValue(value);
  return resolvedValue === true ? "is-valid" : resolvedValue === false ? "is-invalid" : null;
});
var normalizeInput = (v, modelModifiers) => {
  if (v === null) return;
  let update = v;
  if (modelModifiers.number && typeof update === "string" && update !== "") {
    const parsed = Number.parseFloat(update);
    update = Number.isNaN(parsed) ? update : parsed;
  }
  return update;
};
var useFormInput = (props, input, modelValue, modelModifiers) => {
  var _a;
  const computedId = useId$1(() => props.id, "input");
  const debounceNumber = /* @__PURE__ */ useToNumber(() => props.debounce ?? 0, { nanToZero: true });
  const debounceMaxWaitNumber = /* @__PURE__ */ useToNumber(() => props.debounceMaxWait ?? NaN);
  const formGroupData = (_a = inject(formGroupKey, null)) == null ? void 0 : _a();
  formGroupData == null ? void 0 : formGroupData.track(computedId);
  const computedState = computed(() => props.state !== void 0 ? props.state : (formGroupData == null ? void 0 : formGroupData.state.value) ?? null);
  const isDisabled = computed(() => props.disabled || ((formGroupData == null ? void 0 : formGroupData.disabled.value) ?? false));
  const computedAriaInvalid = useAriaInvalid(() => props.ariaInvalid, computedState);
  const stateClass = useStateClass(computedState);
  const internalUpdateModelValue = useDebounceFn((value) => {
    modelValue.value = value;
  }, () => modelModifiers.lazy === true ? 0 : debounceNumber.value, { maxWait: () => modelModifiers.lazy === true ? NaN : debounceMaxWaitNumber.value });
  const updateModelValue = (value, force = false, immediate = false) => {
    if (modelModifiers.lazy === true && force === false) return;
    if (immediate) modelValue.value = value;
    else internalUpdateModelValue(value);
  };
  const { focused } = useFocus(input, { initialValue: props.autofocus });
  const _formatValue = (value, evt, force = false) => {
    if (props.formatter !== void 0 && (!props.lazyFormatter || force)) return props.formatter(value, evt);
    return value;
  };
  onMounted(() => {
    var _a2;
    if (input.value) input.value.value = ((_a2 = modelValue.value) == null ? void 0 : _a2.toString()) ?? "";
  });
  onActivated(() => {
    nextTick(() => {
      if (props.autofocus) focused.value = true;
    });
  });
  const syncDisplayedValue = (nextValue) => {
    if (input.value && input.value.value !== nextValue) input.value.value = nextValue;
  };
  const onInput = (evt) => {
    const { value } = evt.target;
    const formattedValue = _formatValue(value, evt);
    if (evt.defaultPrevented) {
      evt.preventDefault();
      return;
    }
    updateModelValue(formattedValue);
    if (formattedValue !== value) syncDisplayedValue(formattedValue);
  };
  const onChange = (evt) => {
    const { value } = evt.target;
    const formattedValue = _formatValue(value, evt);
    if (evt.defaultPrevented) {
      evt.preventDefault();
      return;
    }
    const nextModel = formattedValue;
    if (modelValue.value !== nextModel) updateModelValue(formattedValue, true);
  };
  const onBlur = (evt) => {
    if (!modelModifiers.lazy && !props.lazyFormatter && !modelModifiers.trim && debounceNumber.value <= 0) return;
    const { value } = evt.target;
    const formattedValue = _formatValue(value, evt, true);
    const nextModel = modelModifiers.trim ? formattedValue.trim() : formattedValue;
    internalUpdateModelValue.cancel();
    if (modelValue.value !== nextModel) updateModelValue(nextModel, true, true);
    if (nextModel !== value) syncDisplayedValue(nextModel);
  };
  const focus = () => {
    if (!isDisabled.value) focused.value = true;
  };
  const blur = () => {
    if (!isDisabled.value) focused.value = false;
  };
  return {
    input,
    computedId,
    computedAriaInvalid,
    onInput,
    onChange,
    onBlur,
    focus,
    blur,
    stateClass,
    isDisabled
  };
};
var _hoisted_1$6 = [
  "id",
  "value",
  "name",
  "form",
  "type",
  "disabled",
  "placeholder",
  "required",
  "autocomplete",
  "readonly",
  "min",
  "max",
  "step",
  "list",
  "aria-required",
  "aria-invalid"
];
var BFormInput_default = /* @__PURE__ */ defineComponent({
  __name: "BFormInput",
  props: /* @__PURE__ */ mergeModels({
    max: { default: void 0 },
    min: { default: void 0 },
    step: { default: void 0 },
    type: { default: "text" },
    ariaInvalid: {
      type: [Boolean, String],
      default: void 0
    },
    autocomplete: { default: void 0 },
    autofocus: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    form: { default: void 0 },
    formatter: {
      type: Function,
      default: void 0
    },
    id: { default: void 0 },
    lazyFormatter: {
      type: Boolean,
      default: false
    },
    list: { default: void 0 },
    name: { default: void 0 },
    placeholder: { default: void 0 },
    plaintext: {
      type: Boolean,
      default: false
    },
    readonly: {
      type: Boolean,
      default: false
    },
    required: {
      type: Boolean,
      default: false
    },
    size: { default: void 0 },
    state: {
      type: [Boolean, null],
      default: void 0
    },
    debounce: { default: 0 },
    debounceMaxWait: { default: NaN }
  }, {
    "modelValue": { default: "" },
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props, { expose: __expose }) {
    const props = useDefaults(__props, "BFormInput");
    const [modelValue, modelModifiers] = useModel(__props, "modelValue", { set: (v) => normalizeInput(v, modelModifiers) });
    const input = useTemplateRef("_input");
    const inInputGroup = inject(inputGroupKey, false);
    const { computedId, computedAriaInvalid, onInput, onChange, onBlur, stateClass, focus, blur, isDisabled } = useFormInput(props, input, modelValue, modelModifiers);
    const computedClasses = computed(() => {
      const isRange = props.type === "range";
      const isColor = props.type === "color";
      return [stateClass.value, {
        "form-range": isRange,
        "form-control": isColor || !props.plaintext && !isRange || isRange && inInputGroup,
        "form-control-color": isColor,
        "form-control-plaintext": props.plaintext && !isRange && !isColor,
        [`form-control-${props.size}`]: !!props.size
      }];
    });
    __expose({
      blur,
      element: input,
      flushDebounce: onBlur,
      focus
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("input", {
        id: unref(computedId),
        ref: "_input",
        value: unref(modelValue),
        class: normalizeClass(computedClasses.value),
        name: unref(props).name || void 0,
        form: unref(props).form || void 0,
        type: unref(props).type,
        disabled: unref(isDisabled),
        placeholder: unref(props).placeholder,
        required: unref(props).required || void 0,
        autocomplete: unref(props).autocomplete || void 0,
        readonly: unref(props).readonly || unref(props).plaintext,
        min: unref(props).min,
        max: unref(props).max,
        step: unref(props).step,
        list: unref(props).type !== "password" ? unref(props).list : void 0,
        "aria-required": unref(props).required || void 0,
        "aria-invalid": unref(computedAriaInvalid),
        onInput: _cache[0] || (_cache[0] = (...args) => unref(onInput) && unref(onInput)(...args)),
        onChange: _cache[1] || (_cache[1] = (...args) => unref(onChange) && unref(onChange)(...args)),
        onBlur: _cache[2] || (_cache[2] = (...args) => unref(onBlur) && unref(onBlur)(...args))
      }, null, 42, _hoisted_1$6);
    };
  }
});
var useFormSelect = (options, props) => {
  const isComplex = (option) => typeof option === "object" && option !== null && "options" in option && Array.isArray(option.options);
  const normalizeOption = (option) => {
    const propsValue = toValue(props);
    if (typeof option === "string") return {
      value: option,
      text: option
    };
    if (typeof option === "number" || typeof option === "boolean") return {
      value: option,
      text: `${option}`
    };
    if (option instanceof Date) return {
      value: option,
      text: option.toLocaleString()
    };
    const value = get(option, propsValue.valueField);
    const text = get(option, propsValue.textField);
    const disabled = get(option, propsValue.disabledField);
    const opts = propsValue.optionsField ? get(option, propsValue.optionsField) : void 0;
    const label = (propsValue.labelField ? get(option, propsValue.labelField) : void 0) || text;
    if (opts !== void 0 && Array.isArray(opts)) return {
      label,
      options: opts
    };
    const simpleOption = typeof option === "object" ? { ...option } : {};
    const fieldsToOmit = /* @__PURE__ */ new Set(["label", "options"]);
    if (propsValue.labelField) fieldsToOmit.add(propsValue.labelField);
    if (propsValue.optionsField) fieldsToOmit.add(propsValue.optionsField);
    fieldsToOmit.forEach((field) => {
      delete simpleOption[field];
    });
    return {
      ...simpleOption,
      value,
      text,
      disabled
    };
  };
  const normalizeOptions = (opts) => opts.map((option) => normalizeOption(option));
  return {
    normalizedOptions: computed(() => normalizeOptions(toValue(options))),
    isComplex
  };
};
var getClasses = (props, els, propPrefix, classPrefix = propPrefix) => els.reduce((arr, prop) => {
  if (!props[prop]) return arr;
  arr.push([
    classPrefix,
    prop.replace(propPrefix, ""),
    props[prop]
  ].filter((e) => e && typeof e !== "boolean").join("-").toLowerCase());
  return arr;
}, []);
var BCol_default = /* @__PURE__ */ defineComponent({
  __name: "BCol",
  props: {
    alignSelf: { default: void 0 },
    tag: { default: "div" },
    order: { default: void 0 },
    offset: { default: void 0 },
    cols: { default: void 0 },
    col: {
      type: Boolean,
      default: false
    },
    offsetSm: { default: void 0 },
    offsetMd: { default: void 0 },
    offsetLg: { default: void 0 },
    offsetXl: { default: void 0 },
    offsetXxl: { default: void 0 },
    orderSm: { default: void 0 },
    orderMd: { default: void 0 },
    orderLg: { default: void 0 },
    orderXl: { default: void 0 },
    orderXxl: { default: void 0 },
    sm: {
      type: [
        Boolean,
        Number,
        String
      ],
      default: false
    },
    md: {
      type: [
        Boolean,
        Number,
        String
      ],
      default: false
    },
    lg: {
      type: [
        Boolean,
        Number,
        String
      ],
      default: false
    },
    xl: {
      type: [
        Boolean,
        Number,
        String
      ],
      default: false
    },
    xxl: {
      type: [
        Boolean,
        Number,
        String
      ],
      default: false
    }
  },
  setup(__props) {
    const props = useDefaults(__props, "BCol");
    const classList = computed(() => [
      ...getClasses({
        sm: props.sm,
        md: props.md,
        lg: props.lg,
        xl: props.xl,
        xxl: props.xxl
      }, [
        "sm",
        "md",
        "lg",
        "xl",
        "xxl"
      ], "col"),
      ...getClasses({
        order: props.order,
        orderLg: props.orderLg,
        orderMd: props.orderMd,
        orderSm: props.orderSm,
        orderXl: props.orderXl,
        orderXxl: props.orderXxl
      }, [
        "order",
        "orderLg",
        "orderMd",
        "orderSm",
        "orderXl",
        "orderXxl"
      ], "order"),
      ...getClasses({
        offset: props.offset,
        offsetLg: props.offsetLg,
        offsetMd: props.offsetMd,
        offsetSm: props.offsetSm,
        offsetXl: props.offsetXl,
        offsetXxl: props.offsetXxl
      }, [
        "offset",
        "offsetLg",
        "offsetMd",
        "offsetSm",
        "offsetXl",
        "offsetXxl"
      ], "offset")
    ]);
    const computedClasses = computed(() => [classList.value, {
      col: props.col || !classList.value.some((v) => v.startsWith("col-")) && !props.cols,
      [`col-${props.cols}`]: props.cols !== void 0,
      [`offset-${props.offset}`]: props.offset !== void 0,
      [`order-${props.order}`]: props.order !== void 0,
      [`align-self-${props.alignSelf}`]: props.alignSelf !== void 0
    }]);
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(unref(props).tag), { class: normalizeClass(computedClasses.value) }, {
        default: withCtx(() => [renderSlot(_ctx.$slots, "default")]),
        _: 3
      }, 8, ["class"]);
    };
  }
});
var _hoisted_1$5 = [
  "value",
  "disabled",
  "selected"
];
var BFormSelectOption_default = /* @__PURE__ */ defineComponent({
  __name: "BFormSelectOption",
  props: {
    disabled: {
      type: Boolean,
      default: false
    },
    value: { default: void 0 }
  },
  setup(__props) {
    const props = useDefaults(__props, "BFormSelectOption");
    const formSelectContext = inject(formSelectKey, null);
    const isSelected = computed(() => {
      if (!formSelectContext) return false;
      return formSelectContext.modelValue.value === props.value;
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("option", mergeProps({
        value: unref(props).value,
        disabled: unref(props).disabled,
        selected: isSelected.value
      }, _ctx.$attrs), [renderSlot(_ctx.$slots, "default")], 16, _hoisted_1$5);
    };
  }
});
var useLabelTargetRegistry = () => {
  const labelTargetIds = /* @__PURE__ */ shallowRef([]);
  const track2 = (idRef) => {
    labelTargetIds.value = [...labelTargetIds.value, idRef];
    onUnmounted(() => {
      labelTargetIds.value = labelTargetIds.value.filter((r) => r !== idRef);
    });
  };
  return {
    labelTargetIds,
    track: track2
  };
};
var useProvideFormGroupData = ({ state, disabled }) => {
  const { labelTargetIds, track: track2 } = useLabelTargetRegistry();
  provide(formGroupKey, () => ({
    state,
    disabled,
    track: track2
  }));
  return { singleLabelTargetId: computed(() => {
    let single = null;
    for (const r of labelTargetIds.value) {
      const v = r.value;
      if (!v) continue;
      if (single !== null && single !== v) return null;
      single = v;
    }
    return single;
  }) };
};
var BFormInvalidFeedback_default = /* @__PURE__ */ defineComponent({
  __name: "BFormInvalidFeedback",
  props: {
    ariaLive: { default: void 0 },
    forceShow: {
      type: Boolean,
      default: false
    },
    id: { default: void 0 },
    role: { default: void 0 },
    state: {
      type: [Boolean, null],
      default: null
    },
    tag: { default: "div" },
    text: { default: void 0 },
    tooltip: {
      type: Boolean,
      default: false
    }
  },
  setup(__props) {
    const props = useDefaults(__props, "BFormInvalidFeedback");
    const computedShow = computed(() => props.forceShow || props.state === false);
    const computedClasses = computed(() => ({
      "d-block": computedShow.value,
      "invalid-feedback": !props.tooltip,
      "invalid-tooltip": props.tooltip
    }));
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(unref(props).tag), {
        id: unref(props).id,
        role: unref(props).role,
        "aria-live": unref(props).ariaLive,
        "aria-atomic": unref(props).ariaLive ? true : void 0,
        class: normalizeClass(computedClasses.value)
      }, {
        default: withCtx(() => [renderSlot(_ctx.$slots, "default", {}, () => [createTextVNode(toDisplayString(unref(props).text), 1)])]),
        _: 3
      }, 8, [
        "id",
        "role",
        "aria-live",
        "aria-atomic",
        "class"
      ]);
    };
  }
});
var BFormRow_default = /* @__PURE__ */ defineComponent({
  __name: "BFormRow",
  props: { tag: { default: "div" } },
  setup(__props) {
    const props = useDefaults(__props, "BFormRow");
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(unref(props).tag), { class: "row d-flex flex-wrap" }, {
        default: withCtx(() => [renderSlot(_ctx.$slots, "default")]),
        _: 3
      });
    };
  }
});
var BFormText_default = /* @__PURE__ */ defineComponent({
  __name: "BFormText",
  props: {
    id: { default: void 0 },
    inline: {
      type: Boolean,
      default: false
    },
    tag: { default: "small" },
    text: { default: void 0 },
    textVariant: { default: "body-secondary" }
  },
  setup(__props) {
    const props = useDefaults(__props, "BFormText");
    const colorClasses = useColorVariantClasses(props);
    const computedClasses = computed(() => [colorClasses.value, { "form-text": !props.inline }]);
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(unref(props).tag), {
        id: unref(props).id,
        class: normalizeClass(computedClasses.value)
      }, {
        default: withCtx(() => [renderSlot(_ctx.$slots, "default", {}, () => [createTextVNode(toDisplayString(unref(props).text), 1)])]),
        _: 3
      }, 8, ["id", "class"]);
    };
  }
});
var BFormValidFeedback_default = /* @__PURE__ */ defineComponent({
  __name: "BFormValidFeedback",
  props: {
    ariaLive: { default: void 0 },
    forceShow: {
      type: Boolean,
      default: false
    },
    id: { default: void 0 },
    role: { default: void 0 },
    state: {
      type: [Boolean, null],
      default: null
    },
    tag: { default: "div" },
    text: { default: void 0 },
    tooltip: {
      type: Boolean,
      default: false
    }
  },
  setup(__props) {
    const props = useDefaults(__props, "BFormInvalidFeedback");
    const computedShow = computed(() => props.forceShow === true || props.state === true);
    const computedClasses = computed(() => ({
      "d-block": computedShow.value,
      "valid-feedback": !props.tooltip,
      "valid-tooltip": props.tooltip
    }));
    return (_ctx, _cache) => {
      return openBlock(), createBlock(resolveDynamicComponent(unref(props).tag), {
        id: unref(props).id,
        role: unref(props).role,
        "aria-live": unref(props).ariaLive,
        "aria-atomic": unref(props).ariaLive ? true : void 0,
        class: normalizeClass(computedClasses.value)
      }, {
        default: withCtx(() => [renderSlot(_ctx.$slots, "default", {}, () => [createTextVNode(toDisplayString(unref(props).text), 1)])]),
        _: 3
      }, 8, [
        "id",
        "role",
        "aria-live",
        "aria-atomic",
        "class"
      ]);
    };
  }
});
var suffixPropName = (suffix, value) => value + (suffix ? upperFirst(suffix) : "");
var BFormGroupContent_default = /* @__PURE__ */ defineComponent({
  __name: "BFormGroupContent",
  props: {
    invalidFeedback: {},
    validFeedback: {},
    description: {},
    feedbackAriaLive: {},
    state: { type: [Boolean, null] },
    tooltip: { type: Boolean },
    invalidFeedbackId: {},
    validFeedbackId: {},
    descriptionId: {}
  },
  setup(__props) {
    const slots = useSlots();
    const hasInvalidFeedbackSlot = computed(() => !!slots["invalid-feedback"]);
    const hasValidFeedbackSlot = computed(() => !!slots["valid-feedback"]);
    const hasDescriptionSlot = computed(() => !!slots["description"]);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock(Fragment, null, [
        hasInvalidFeedbackSlot.value || __props.invalidFeedback ? (openBlock(), createBlock(BFormInvalidFeedback_default, {
          key: 0,
          id: __props.invalidFeedbackId,
          "aria-live": __props.feedbackAriaLive,
          state: __props.state,
          tooltip: __props.tooltip
        }, {
          default: withCtx(() => [renderSlot(_ctx.$slots, "invalid-feedback", {}, () => [createTextVNode(toDisplayString(__props.invalidFeedback), 1)])]),
          _: 3
        }, 8, [
          "id",
          "aria-live",
          "state",
          "tooltip"
        ])) : createCommentVNode("", true),
        hasValidFeedbackSlot.value || __props.validFeedback ? (openBlock(), createBlock(BFormValidFeedback_default, {
          key: 1,
          id: __props.validFeedbackId,
          "aria-live": __props.feedbackAriaLive,
          state: __props.state,
          tooltip: __props.tooltip
        }, {
          default: withCtx(() => [renderSlot(_ctx.$slots, "valid-feedback", {}, () => [createTextVNode(toDisplayString(__props.validFeedback), 1)])]),
          _: 3
        }, 8, [
          "id",
          "aria-live",
          "state",
          "tooltip"
        ])) : createCommentVNode("", true),
        hasDescriptionSlot.value || __props.description ? (openBlock(), createBlock(BFormText_default, {
          key: 2,
          id: __props.descriptionId
        }, {
          default: withCtx(() => [renderSlot(_ctx.$slots, "description", {}, () => [createTextVNode(toDisplayString(__props.description), 1)])]),
          _: 3
        }, 8, ["id"])) : createCommentVNode("", true)
      ], 64);
    };
  }
});
var BFormGroupLabel_default = /* @__PURE__ */ defineComponent({
  __name: "BFormGroupLabel",
  props: {
    label: {},
    labelTag: {},
    labelId: {},
    computedLabelFor: {},
    isFieldset: { type: Boolean },
    isHorizontal: { type: Boolean },
    labelColProps: {},
    labelAlignClasses: {},
    labelClasses: {}
  },
  emits: ["legendClick"],
  setup(__props, { emit: __emit }) {
    const emit2 = __emit;
    return (_ctx, _cache) => {
      return __props.isHorizontal ? (openBlock(), createBlock(BCol_default, mergeProps({ key: 0 }, __props.labelColProps, {
        id: __props.labelId,
        tag: __props.labelTag,
        for: __props.computedLabelFor || null,
        tabindex: __props.isFieldset ? "-1" : null,
        class: [__props.labelAlignClasses, __props.labelClasses],
        onClick: _cache[0] || (_cache[0] = ($event) => __props.isFieldset ? (e) => emit2("legendClick", e) : void 0)
      }), {
        default: withCtx(() => [renderSlot(_ctx.$slots, "label", {}, () => [createTextVNode(toDisplayString(__props.label), 1)])]),
        _: 3
      }, 16, [
        "id",
        "tag",
        "for",
        "tabindex",
        "class"
      ])) : (openBlock(), createBlock(resolveDynamicComponent(__props.labelTag), {
        key: 1,
        id: __props.labelId,
        for: __props.computedLabelFor || null,
        tabindex: __props.isFieldset ? "-1" : null,
        class: normalizeClass(__props.labelClasses),
        onClick: _cache[1] || (_cache[1] = ($event) => __props.isFieldset ? (e) => emit2("legendClick", e) : void 0)
      }, {
        default: withCtx(() => [renderSlot(_ctx.$slots, "label", {}, () => [createTextVNode(toDisplayString(__props.label), 1)])]),
        _: 3
      }, 8, [
        "id",
        "for",
        "tabindex",
        "class"
      ]));
    };
  }
});
var _hoisted_1$4 = [
  "id",
  "disabled",
  "aria-invalid",
  "aria-labelledby"
];
var _hoisted_2$2 = {
  key: 0,
  ref: "_content",
  class: "form-floating"
};
var BFormGroup_default = /* @__PURE__ */ defineComponent({
  inheritAttrs: false,
  __name: "BFormGroup",
  props: {
    contentCols: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    labelCols: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    labelAlign: { default: void 0 },
    ariaInvalid: {
      type: [Boolean, String],
      default: void 0
    },
    description: { default: void 0 },
    disabled: {
      type: Boolean,
      default: false
    },
    feedbackAriaLive: { default: "assertive" },
    floating: {
      type: Boolean,
      default: false
    },
    id: { default: void 0 },
    invalidFeedback: { default: void 0 },
    label: { default: void 0 },
    labelClass: { default: void 0 },
    labelFor: { default: void 0 },
    labelSize: { default: void 0 },
    labelVisuallyHidden: {
      type: Boolean,
      default: false
    },
    state: {
      type: [Boolean, null],
      default: null
    },
    tooltip: {
      type: Boolean,
      default: false
    },
    validFeedback: { default: void 0 },
    validated: {
      type: Boolean,
      default: false
    },
    contentColsSm: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    contentColsMd: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    contentColsLg: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    contentColsXl: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    labelColsSm: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    labelColsMd: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    labelColsLg: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    labelColsXl: {
      type: [
        Boolean,
        String,
        Number
      ],
      default: void 0
    },
    labelAlignSm: { default: void 0 },
    labelAlignMd: { default: void 0 },
    labelAlignLg: { default: void 0 },
    labelAlignXl: { default: void 0 }
  },
  setup(__props) {
    const INPUTS = [
      "input",
      "select",
      "textarea"
    ];
    const props = useDefaults(__props, "BFormGroup");
    const slots = useSlots();
    const computedState = /* @__PURE__ */ toRef(() => props.state);
    const { singleLabelTargetId } = useProvideFormGroupData({
      state: computedState,
      disabled: /* @__PURE__ */ toRef(() => props.disabled)
    });
    const computedLabelFor = computed(() => props.labelFor ?? singleLabelTargetId.value);
    const breakPoints = [
      "xs",
      "sm",
      "md",
      "lg",
      "xl"
    ];
    const getColProps = (props2, prefix) => breakPoints.reduce((result, breakpoint) => {
      let propValue = props2[suffixPropName(breakpoint === "xs" ? "" : breakpoint, `${prefix}Cols`)];
      propValue = propValue === "" ? true : propValue || false;
      if (!(typeof propValue === "boolean") && propValue !== "auto") {
        const val = Number.parseInt(propValue);
        propValue = Number.isNaN(val) ? 0 : val;
        propValue = propValue > 0 ? propValue : false;
      }
      if (propValue) if (breakpoint === "xs") result[typeof propValue === "boolean" ? "col" : "cols"] = propValue;
      else result[breakpoint || (typeof propValue === "boolean" ? "col" : "cols")] = propValue;
      return result;
    }, {});
    const content = useTemplateRef("_content");
    const contentColProps = computed(() => getColProps(props, "content"));
    const labelAlignClasses = computed(() => ((props2, prefix) => breakPoints.reduce((result, breakpoint) => {
      const propValue = props2[suffixPropName(breakpoint === "xs" ? "" : breakpoint, `${prefix}Align`)] || null;
      if (propValue) if (breakpoint === "xs") result.push(`text-${propValue}`);
      else result.push(`text-${breakpoint}-${propValue}`);
      return result;
    }, []))(props, "label"));
    const labelColProps = computed(() => getColProps(props, "label"));
    const isHorizontal = computed(() => Object.keys(contentColProps.value).length > 0 || Object.keys(labelColProps.value).length > 0);
    const stateClass = useStateClass(computedState);
    const computedAriaInvalid = useAriaInvalid(() => props.ariaInvalid, computedState);
    const onLegendClick = (event) => {
      if (computedLabelFor.value || content.value === null) return;
      const { target } = event;
      const tagName = target ? target.tagName : "";
      if ([
        ...INPUTS,
        "a",
        "button",
        "label"
      ].indexOf(tagName) !== -1) return;
      const contentElement = isHorizontal.value && content.value && "$el" in content.value ? content.value.$el : content.value;
      if (!contentElement) return;
      const inputs = [...contentElement.querySelectorAll(INPUTS.map((v) => `${v}:not([disabled])`).join())].filter(isVisible);
      const [inp] = inputs;
      if (inputs.length === 1 && inp instanceof HTMLElement) attemptFocus(inp);
    };
    const computedId = useId$1(() => props.id);
    const labelId = useId$1(void 0, "_BV_label_");
    const labelTag = computed(() => !computedLabelFor.value ? "legend" : "label");
    const labelClasses = computed(() => [
      isHorizontal.value ? "col-form-label" : "form-label",
      {
        "bv-no-focus-ring": !computedLabelFor.value,
        "col-form-label": isHorizontal.value || !computedLabelFor.value,
        "pt-0": !isHorizontal.value && !computedLabelFor.value,
        "d-block": !isHorizontal.value && computedLabelFor.value,
        [`col-form-label-${props.labelSize}`]: !!props.labelSize,
        "visually-hidden": props.labelVisuallyHidden
      },
      isHorizontal.value ? null : labelAlignClasses.value,
      props.labelClass
    ]);
    const invalidFeedbackId = useId$1(void 0, "_BV_feedback_invalid_");
    const validFeedbackId = useId$1(void 0, "_BV_feedback_valid_");
    const descriptionId = useId$1(void 0, "_BV_description_");
    const isFieldset = computed(() => !computedLabelFor.value);
    const labelShowing = computed(() => !!slots.label || !!props.label || isHorizontal.value);
    const labelComponentProps = computed(() => ({
      label: props.label,
      labelTag: labelTag.value,
      labelId: labelId.value,
      computedLabelFor: computedLabelFor.value,
      isFieldset: isFieldset.value,
      isHorizontal: isHorizontal.value,
      labelColProps: labelColProps.value,
      labelAlignClasses: labelAlignClasses.value,
      labelClasses: labelClasses.value
    }));
    const contentComponentProps = computed(() => ({
      invalidFeedback: props.invalidFeedback,
      validFeedback: props.validFeedback,
      description: props.description,
      feedbackAriaLive: props.feedbackAriaLive,
      state: computedState.value,
      tooltip: props.tooltip,
      invalidFeedbackId: invalidFeedbackId.value,
      validFeedbackId: validFeedbackId.value,
      descriptionId: descriptionId.value
    }));
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("fieldset", mergeProps({
        id: unref(computedId),
        disabled: unref(props).disabled,
        "aria-invalid": unref(computedAriaInvalid),
        "aria-labelledby": isFieldset.value && isHorizontal.value ? unref(labelId) : void 0
      }, _ctx.$attrs, { class: [[unref(stateClass), { "was-validated": unref(props).validated }], "b-form-group"] }), [isHorizontal.value ? (openBlock(), createBlock(BFormRow_default, { key: 0 }, {
        default: withCtx(() => [labelShowing.value ? (openBlock(), createBlock(BFormGroupLabel_default, mergeProps({ key: 0 }, labelComponentProps.value, { onLegendClick }), createSlots({ _: 2 }, [slots.label ? {
          name: "label",
          fn: withCtx(() => [renderSlot(_ctx.$slots, "label")]),
          key: "0"
        } : void 0]), 1040)) : createCommentVNode("", true), createVNode(BCol_default, mergeProps(contentColProps.value, { ref: "_content" }), {
          default: withCtx(() => [renderSlot(_ctx.$slots, "default", {
            id: unref(computedId),
            ariaDescribedby: null,
            descriptionId: unref(descriptionId),
            labelId: unref(labelId)
          }), createVNode(BFormGroupContent_default, normalizeProps(guardReactiveProps(contentComponentProps.value)), createSlots({ _: 2 }, [
            slots["invalid-feedback"] ? {
              name: "invalid-feedback",
              fn: withCtx(() => [renderSlot(_ctx.$slots, "invalid-feedback")]),
              key: "0"
            } : void 0,
            slots["valid-feedback"] ? {
              name: "valid-feedback",
              fn: withCtx(() => [renderSlot(_ctx.$slots, "valid-feedback")]),
              key: "1"
            } : void 0,
            slots.description ? {
              name: "description",
              fn: withCtx(() => [renderSlot(_ctx.$slots, "description")]),
              key: "2"
            } : void 0
          ]), 1040)]),
          _: 3
        }, 16)]),
        _: 3
      })) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [unref(props).floating && !isHorizontal.value ? (openBlock(), createElementBlock("div", _hoisted_2$2, [
        renderSlot(_ctx.$slots, "default", {
          id: unref(computedId),
          ariaDescribedby: null,
          descriptionId: unref(descriptionId),
          labelId: unref(labelId)
        }),
        labelShowing.value ? (openBlock(), createBlock(BFormGroupLabel_default, mergeProps({ key: 0 }, labelComponentProps.value, { onLegendClick }), createSlots({ _: 2 }, [slots.label ? {
          name: "label",
          fn: withCtx(() => [renderSlot(_ctx.$slots, "label")]),
          key: "0"
        } : void 0]), 1040)) : createCommentVNode("", true),
        createVNode(BFormGroupContent_default, normalizeProps(guardReactiveProps(contentComponentProps.value)), createSlots({ _: 2 }, [
          slots["invalid-feedback"] ? {
            name: "invalid-feedback",
            fn: withCtx(() => [renderSlot(_ctx.$slots, "invalid-feedback")]),
            key: "0"
          } : void 0,
          slots["valid-feedback"] ? {
            name: "valid-feedback",
            fn: withCtx(() => [renderSlot(_ctx.$slots, "valid-feedback")]),
            key: "1"
          } : void 0,
          slots.description ? {
            name: "description",
            fn: withCtx(() => [renderSlot(_ctx.$slots, "description")]),
            key: "2"
          } : void 0
        ]), 1040)
      ], 512)) : (openBlock(), createElementBlock(Fragment, { key: 1 }, [
        labelShowing.value ? (openBlock(), createBlock(BFormGroupLabel_default, mergeProps({ key: 0 }, labelComponentProps.value, { onLegendClick }), createSlots({ _: 2 }, [slots.label ? {
          name: "label",
          fn: withCtx(() => [renderSlot(_ctx.$slots, "label")]),
          key: "0"
        } : void 0]), 1040)) : createCommentVNode("", true),
        renderSlot(_ctx.$slots, "default", {
          id: unref(computedId),
          ariaDescribedby: null,
          descriptionId: unref(descriptionId),
          labelId: unref(labelId)
        }),
        createVNode(BFormGroupContent_default, normalizeProps(guardReactiveProps(contentComponentProps.value)), createSlots({ _: 2 }, [
          slots["invalid-feedback"] ? {
            name: "invalid-feedback",
            fn: withCtx(() => [renderSlot(_ctx.$slots, "invalid-feedback")]),
            key: "0"
          } : void 0,
          slots["valid-feedback"] ? {
            name: "valid-feedback",
            fn: withCtx(() => [renderSlot(_ctx.$slots, "valid-feedback")]),
            key: "1"
          } : void 0,
          slots.description ? {
            name: "description",
            fn: withCtx(() => [renderSlot(_ctx.$slots, "description")]),
            key: "2"
          } : void 0
        ]), 1040)
      ], 64))], 64))], 16, _hoisted_1$4);
    };
  }
});
var _hoisted_1$1$1 = ["label"];
var BFormSelectOptionGroup_default = /* @__PURE__ */ defineComponent({
  __name: "BFormSelectOptionGroup",
  props: {
    disabledField: { default: "disabled" },
    label: { default: void 0 },
    options: { default: () => [] },
    textField: { default: "text" },
    valueField: { default: "value" }
  },
  setup(__props) {
    const props = useDefaults(__props, "BFormSelectOptionGroup");
    const { normalizedOptions } = useFormSelect(() => props.options, props);
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("optgroup", { label: unref(props).label }, [
        renderSlot(_ctx.$slots, "first"),
        (openBlock(true), createElementBlock(Fragment, null, renderList(unref(normalizedOptions), (option, index) => {
          return openBlock(), createBlock(BFormSelectOption_default, mergeProps({ key: index }, { ref_for: true }, {
            ..._ctx.$attrs,
            ...option
          }), {
            default: withCtx(() => [renderSlot(_ctx.$slots, "option", mergeProps({ ref_for: true }, option), () => [createTextVNode(toDisplayString(option.text), 1)])]),
            _: 2
          }, 1040);
        }), 128)),
        renderSlot(_ctx.$slots, "default")
      ], 8, _hoisted_1$1$1);
    };
  }
});
var _hoisted_1$3 = [
  "id",
  "name",
  "form",
  "multiple",
  "size",
  "disabled",
  "required",
  "aria-required",
  "aria-invalid"
];
var BFormSelectBase_default = /* @__PURE__ */ defineComponent({
  __name: "BFormSelectBase",
  props: /* @__PURE__ */ mergeModels({
    ariaInvalid: {
      type: [Boolean, String],
      default: void 0
    },
    autofocus: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    disabledField: { default: "disabled" },
    form: { default: void 0 },
    id: { default: void 0 },
    labelField: { default: "label" },
    multiple: {
      type: Boolean,
      default: false
    },
    name: { default: void 0 },
    options: { default: () => [] },
    optionsField: { default: "options" },
    plain: {
      type: Boolean,
      default: false
    },
    required: {
      type: Boolean,
      default: false
    },
    selectSize: { default: 0 },
    size: { default: void 0 },
    state: {
      type: [Boolean, null],
      default: null
    },
    textField: { default: "text" },
    valueField: { default: "value" }
  }, {
    "modelValue": { default: "" },
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props, { expose: __expose }) {
    var _a;
    const props = useDefaults(__props, "BFormSelect");
    const modelValue = useModel(__props, "modelValue");
    const computedId = useId$1(() => props.id, "input");
    const formGroupData = (_a = inject(formGroupKey, null)) == null ? void 0 : _a();
    formGroupData == null ? void 0 : formGroupData.track(computedId);
    const isDisabled = computed(() => props.disabled || ((formGroupData == null ? void 0 : formGroupData.disabled.value) ?? false));
    const selectSizeNumber = /* @__PURE__ */ useToNumber(() => props.selectSize);
    const stateClass = useStateClass(() => props.state);
    const input = useTemplateRef("_input");
    const { focused } = useFocus(input, { initialValue: props.autofocus });
    const computedClasses = computed(() => [stateClass.value, {
      "form-control": props.plain,
      [`form-control-${props.size}`]: props.size !== void 0 && props.plain,
      "form-select": !props.plain,
      [`form-select-${props.size}`]: props.size !== void 0 && !props.plain
    }]);
    const computedSelectSize = computed(() => !props.plain && selectSizeNumber.value > 0 ? selectSizeNumber.value : void 0);
    const computedAriaInvalid = useAriaInvalid(() => props.ariaInvalid, () => props.state);
    const { normalizedOptions, isComplex } = useFormSelect(() => props.options, props);
    const normalizedOptsWrapper = computed(() => normalizedOptions.value);
    const localValue = computed({
      get: () => modelValue.value,
      set: (newValue) => {
        modelValue.value = newValue;
      }
    });
    provide(formSelectKey, { modelValue: /* @__PURE__ */ readonly(localValue) });
    __expose({
      blur: () => {
        focused.value = false;
      },
      element: input,
      focus: () => {
        focused.value = true;
      }
    });
    return (_ctx, _cache) => {
      return withDirectives((openBlock(), createElementBlock("select", {
        id: unref(computedId),
        ref: "_input",
        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => localValue.value = $event),
        class: normalizeClass(computedClasses.value),
        name: unref(props).name,
        form: unref(props).form || void 0,
        multiple: unref(props).multiple || void 0,
        size: computedSelectSize.value,
        disabled: isDisabled.value,
        required: unref(props).required || void 0,
        "aria-required": unref(props).required || void 0,
        "aria-invalid": unref(computedAriaInvalid)
      }, [
        renderSlot(_ctx.$slots, "first"),
        (openBlock(true), createElementBlock(Fragment, null, renderList(normalizedOptsWrapper.value, (option, index) => {
          return openBlock(), createElementBlock(Fragment, { key: index }, [unref(isComplex)(option) ? (openBlock(), createBlock(BFormSelectOptionGroup_default, {
            key: 0,
            label: option.label,
            options: option.options,
            "value-field": unref(props).valueField,
            "text-field": unref(props).textField,
            "disabled-field": unref(props).disabledField
          }, null, 8, [
            "label",
            "options",
            "value-field",
            "text-field",
            "disabled-field"
          ])) : (openBlock(), createBlock(BFormSelectOption_default, mergeProps({
            key: 1,
            ref_for: true
          }, option), {
            default: withCtx(() => [renderSlot(_ctx.$slots, "option", mergeProps({ ref_for: true }, option), () => [createTextVNode(toDisplayString(option.text), 1)])]),
            _: 2
          }, 1040))], 64);
        }), 128)),
        renderSlot(_ctx.$slots, "default")
      ], 10, _hoisted_1$3)), [[vModelSelect, localValue.value]]);
    };
  }
});
var BFormSelect_default = /* @__PURE__ */ defineComponent({
  __name: "BFormSelect",
  props: /* @__PURE__ */ mergeModels({
    ariaInvalid: {
      type: [Boolean, String],
      default: void 0
    },
    autofocus: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    disabledField: { default: "disabled" },
    form: { default: void 0 },
    id: { default: void 0 },
    labelField: { default: "label" },
    multiple: {
      type: Boolean,
      default: false
    },
    name: { default: void 0 },
    options: { default: () => [] },
    optionsField: { default: "options" },
    plain: {
      type: Boolean,
      default: false
    },
    required: {
      type: Boolean,
      default: false
    },
    selectSize: { default: 0 },
    size: { default: void 0 },
    state: {
      type: [Boolean, null],
      default: null
    },
    textField: { default: "text" },
    valueField: { default: "value" }
  }, {
    "modelValue": { default: "" },
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props) {
    const props = __props;
    const modelValue = useModel(__props, "modelValue");
    const normalizeSimpleOption = (el) => ({
      ...el,
      value: el[props.valueField],
      text: el[props.textField] ?? "",
      disabled: el[props.disabledField] ?? false
    });
    const normalizePrimitive = (el) => ({
      value: el,
      text: String(el),
      disabled: false
    });
    const normalizedOptions = computed(() => {
      const optionsArray = props.options ?? [];
      if (optionsArray.some((el) => typeof el !== "string" && typeof el !== "number" && typeof el !== "boolean" && el[props.optionsField] !== void 0)) return optionsArray.map((el) => {
        if (typeof el === "string" || typeof el === "number" || typeof el === "boolean") return normalizePrimitive(el);
        const optionsField = el[props.optionsField];
        if (optionsField !== void 0 && Array.isArray(optionsField)) return {
          label: el[props.labelField] ?? el[props.textField] ?? "",
          options: optionsField.map((subOpt) => {
            if (typeof subOpt === "string" || typeof subOpt === "number" || typeof subOpt === "boolean") return normalizePrimitive(subOpt);
            return normalizeSimpleOption(subOpt);
          })
        };
        return normalizeSimpleOption(el);
      });
      return optionsArray.map((el) => {
        if (typeof el === "string" || typeof el === "number" || typeof el === "boolean") return normalizePrimitive(el);
        return normalizeSimpleOption(el);
      });
    });
    const forwardedProps = computed(() => ({
      ariaInvalid: props.ariaInvalid,
      autofocus: props.autofocus,
      disabled: props.disabled,
      form: props.form,
      id: props.id,
      multiple: props.multiple,
      name: props.name,
      plain: props.plain,
      required: props.required,
      selectSize: props.selectSize,
      size: props.size,
      state: props.state
    }));
    return (_ctx, _cache) => {
      return openBlock(), createBlock(BFormSelectBase_default, mergeProps(forwardedProps.value, {
        modelValue: modelValue.value,
        "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => modelValue.value = $event),
        options: normalizedOptions.value
      }), {
        first: withCtx(() => [renderSlot(_ctx.$slots, "first")]),
        option: withCtx((slotProps) => [renderSlot(_ctx.$slots, "option", normalizeProps(guardReactiveProps(slotProps)))]),
        default: withCtx(() => [renderSlot(_ctx.$slots, "default")]),
        _: 3
      }, 16, ["modelValue", "options"]);
    };
  }
});
var useTextareaResize = (input, { maxRows, noAutoShrink, rows }) => {
  const height = /* @__PURE__ */ ref(0);
  const maxRowsNumber = /* @__PURE__ */ useToNumber(computed(() => toValue(maxRows) || NaN), {
    method: "parseInt",
    nanToZero: true
  });
  const rowsNumber = /* @__PURE__ */ useToNumber(rows, {
    method: "parseInt",
    nanToZero: true
  });
  const computedMinRows = computed(() => Math.max(rowsNumber.value || 2, 2));
  const computedMaxRows = computed(() => Math.max(computedMinRows.value, maxRowsNumber.value || 0));
  const computedRows = computed(() => computedMinRows.value === computedMaxRows.value ? computedMinRows.value : null);
  const handleHeightChange = async () => {
    if (!input.value || !isVisible(input.value)) {
      height.value = null;
      return;
    }
    const computedStyle = getComputedStyle(input.value);
    const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 1;
    const border = (Number.parseFloat(computedStyle.borderTopWidth) || 0) + (Number.parseFloat(computedStyle.borderBottomWidth) || 0);
    const padding = (Number.parseFloat(computedStyle.paddingTop) || 0) + (Number.parseFloat(computedStyle.paddingBottom) || 0);
    const offset = border + padding;
    const minHeight = lineHeight * computedMinRows.value + offset;
    const oldHeight = input.value.style.height || computedStyle.height;
    height.value = "auto";
    await nextTick();
    if (!input.value) return;
    const { scrollHeight } = input.value;
    height.value = oldHeight;
    await nextTick();
    if (!input.value) return;
    const contentRows = Math.max((scrollHeight - padding) / lineHeight, 2);
    const rows2 = Math.min(Math.max(contentRows, computedMinRows.value), computedMaxRows.value);
    const newHeight = Math.max(Math.ceil(rows2 * lineHeight + offset), minHeight);
    if (toValue(noAutoShrink) && (Number.parseFloat(oldHeight.toString()) || 0) > newHeight) {
      height.value = oldHeight;
      return;
    }
    height.value = `${newHeight}px`;
  };
  onMounted(handleHeightChange);
  return {
    onInput: handleHeightChange,
    computedStyles: computed(() => ({
      resize: "none",
      height: typeof height.value === "string" ? height.value : height.value ? `${height.value}px` : void 0
    })),
    computedRows
  };
};
var _hoisted_1$2 = [
  "id",
  "name",
  "form",
  "value",
  "disabled",
  "placeholder",
  "required",
  "autocomplete",
  "readonly",
  "aria-required",
  "aria-invalid",
  "rows",
  "wrap"
];
var BFormTextarea_default = /* @__PURE__ */ defineComponent({
  __name: "BFormTextarea",
  props: /* @__PURE__ */ mergeModels({
    noResize: {
      type: Boolean,
      default: false
    },
    rows: { default: 2 },
    wrap: { default: "soft" },
    noAutoShrink: {
      type: Boolean,
      default: false
    },
    maxRows: { default: void 0 },
    ariaInvalid: {
      type: [Boolean, String],
      default: void 0
    },
    autocomplete: { default: void 0 },
    autofocus: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    },
    form: { default: void 0 },
    formatter: {
      type: Function,
      default: void 0
    },
    id: { default: void 0 },
    lazyFormatter: {
      type: Boolean,
      default: false
    },
    list: { default: void 0 },
    name: { default: void 0 },
    placeholder: { default: void 0 },
    plaintext: {
      type: Boolean,
      default: false
    },
    readonly: {
      type: Boolean,
      default: false
    },
    required: {
      type: Boolean,
      default: false
    },
    size: { default: void 0 },
    state: {
      type: [Boolean, null],
      default: void 0
    },
    debounce: { default: 0 },
    debounceMaxWait: { default: NaN }
  }, {
    "modelValue": { default: "" },
    "modelModifiers": {}
  }),
  emits: ["update:modelValue"],
  setup(__props, { expose: __expose }) {
    const props = useDefaults(__props, "BFormTextarea");
    const [modelValue, modelModifiers] = useModel(__props, "modelValue", { set: (v) => normalizeInput(v, modelModifiers) });
    const input = useTemplateRef("_input");
    const { computedId, computedAriaInvalid, onInput, stateClass, onChange, onBlur, focus, blur, isDisabled } = useFormInput(props, input, modelValue, modelModifiers);
    const computedClasses = computed(() => [
      stateClass.value,
      props.plaintext ? "form-control-plaintext" : "form-control",
      { [`form-control-${props.size}`]: !!props.size }
    ]);
    const { computedStyles: resizeStyles, onInput: handleHeightChange, computedRows } = useTextareaResize(input, {
      maxRows: () => props.maxRows,
      rows: () => props.rows,
      noAutoShrink: () => props.noAutoShrink
    });
    const computedStyles = computed(() => ({
      resize: props.noResize ? "none" : void 0,
      ...props.maxRows || props.noAutoShrink ? resizeStyles.value : void 0
    }));
    __expose({
      blur,
      element: input,
      flushDebounce: onBlur,
      focus
    });
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("textarea", {
        id: unref(computedId),
        ref: "_input",
        class: normalizeClass(computedClasses.value),
        name: unref(props).name || void 0,
        form: unref(props).form || void 0,
        value: unref(modelValue) ?? void 0,
        disabled: unref(isDisabled),
        placeholder: unref(props).placeholder,
        required: unref(props).required || void 0,
        autocomplete: unref(props).autocomplete || void 0,
        readonly: unref(props).readonly || unref(props).plaintext,
        "aria-required": unref(props).required || void 0,
        "aria-invalid": unref(computedAriaInvalid),
        rows: unref(computedRows) || 2,
        style: normalizeStyle(computedStyles.value),
        wrap: unref(props).wrap || void 0,
        onInput: _cache[0] || (_cache[0] = (e) => {
          unref(onInput)(e);
          unref(handleHeightChange)();
        }),
        onChange: _cache[1] || (_cache[1] = (...args) => unref(onChange) && unref(onChange)(...args)),
        onBlur: _cache[2] || (_cache[2] = (...args) => unref(onBlur) && unref(onBlur)(...args))
      }, null, 46, _hoisted_1$2);
    };
  }
});
var componentsWithExternalPath = {
  BAspect: "/components/BAspect",
  BAccordion: "/components/BAccordion",
  BAccordionItem: "/components/BAccordion",
  BAlert: "/components/BAlert",
  BApp: "/components/BApp",
  BAutocomplete: "/components/BAutocomplete",
  BAvatar: "/components/BAvatar",
  BAvatarGroup: "/components/BAvatar",
  BBadge: "/components/BBadge",
  BBreadcrumb: "/components/BBreadcrumb",
  BBreadcrumbItem: "/components/BBreadcrumb",
  BButton: "/components/BButton",
  BButtonGroup: "/components/BButton",
  BButtonToolbar: "/components/BButton",
  BCloseButton: "/components/BButton",
  BCard: "/components/BCard",
  BCardBody: "/components/BCard",
  BCardFooter: "/components/BCard",
  BCardGroup: "/components/BCard",
  BCardHeader: "/components/BCard",
  BCardImg: "/components/BCard",
  BCardSubtitle: "/components/BCard",
  BCardText: "/components/BCard",
  BCardTitle: "/components/BCard",
  BCarousel: "/components/BCarousel",
  BCarouselSlide: "/components/BCarousel",
  BCol: "/components/BContainer",
  BCollapse: "/components/BCollapse",
  BContainer: "/components/BContainer",
  BDateField: "/components/BDateField",
  BDatePicker: "/components/BDatePicker",
  BDateRangeField: "/components/BDateField",
  BDateRangePicker: "/components/BDatePicker",
  BDropdown: "/components/BDropdown",
  BDropdownDivider: "/components/BDropdown",
  BDropdownForm: "/components/BDropdown",
  BDropdownGroup: "/components/BDropdown",
  BDropdownHeader: "/components/BDropdown",
  BDropdownItem: "/components/BDropdown",
  BDropdownItemButton: "/components/BDropdown",
  BDropdownText: "/components/BDropdown",
  BForm: "/components/BForm",
  BFormCheckbox: "/components/BFormCheckbox",
  BFormCheckboxGroup: "/components/BFormCheckbox",
  BFormDatalist: "/components/BForm",
  BFormFile: "/components/BFormFile",
  BFormFloatingLabel: "/components/BForm",
  BFormGroup: "/components/BFormGroup",
  BFormInput: "/components/BFormInput",
  BFormInvalidFeedback: "/components/BForm",
  BFormRadio: "/components/BFormRadio",
  BFormRadioGroup: "/components/BFormRadio",
  BFormRating: "/components/BFormRating",
  BFormRow: "/components/BForm",
  BFormSelect: "/components/BFormSelect",
  BFormSelectOption: "/components/BFormSelect",
  BFormSelectOptionGroup: "/components/BFormSelect",
  BFormSpinbutton: "/components/BFormSpinbutton",
  BFormTag: "/components/BFormTags",
  BFormTags: "/components/BFormTags",
  BFormText: "/components/BForm",
  BFormTextarea: "/components/BFormTextarea",
  BFormValidFeedback: "/components/BForm",
  BImg: "/components/BImg",
  BInput: "/components/BFormInput",
  BInputGroup: "/components/BInputGroup",
  BInputGroupText: "/components/BInputGroup",
  BListGroup: "/components/BListGroup",
  BListGroupItem: "/components/BListGroup",
  BModal: "/components/BModal",
  BNav: "/components/BNav",
  BNavForm: "/components/BNav",
  BNavItem: "/components/BNav",
  BNavItemDropdown: "/components/BNav",
  BNavText: "/components/BNav",
  BNavbar: "/components/BNavbar",
  BNavbarBrand: "/components/BNavbar",
  BNavbarNav: "/components/BNavbar",
  BNavbarToggle: "/components/BNavbar",
  BOffcanvas: "/components/BOffcanvas",
  BFormOtp: "/components/BFormOtp",
  BOverlay: "/components/BOverlay",
  BOrchestrator: "/components/BApp",
  BPagination: "/components/BPagination",
  BPlaceholder: "/components/BPlaceholder",
  BPlaceholderButton: "/components/BPlaceholder",
  BPlaceholderCard: "/components/BPlaceholder",
  BPlaceholderTable: "/components/BPlaceholder",
  BPlaceholderWrapper: "/components/BPlaceholder",
  BPopover: "/components/BPopover",
  BProgress: "/components/BProgress",
  BRow: "/components/BContainer",
  BSpinner: "/components/BSpinner",
  BTab: "/components/BTabs",
  BTabs: "/components/BTabs",
  BToast: "/components/BToast",
  BTooltip: "/components/BTooltip",
  BLink: "/components/BLink",
  BProgressBar: "/components/BProgress",
  BTableSimple: "/components/BTable",
  BTableLite: "/components/BTable",
  BTable: "/components/BTable",
  BTbody: "/components/BTable",
  BTd: "/components/BTable",
  BTh: "/components/BTable",
  BThead: "/components/BTable",
  BTfoot: "/components/BTable",
  BTr: "/components/BTable",
  BTimeField: "/components/BTimeField",
  BTimeRangeField: "/components/BDateField"
};
var componentNames = Object.freeze(Object.keys(componentsWithExternalPath));
var directivesWithExternalPath = {
  vBColorMode: "/directives/BColorMode",
  vBModal: "/directives/BModal",
  vBPopover: "/directives/BPopover",
  vBScrollspy: "/directives/BScrollspy",
  vBToggle: "/directives/BToggle",
  vBTooltip: "/directives/BTooltip"
};
var directiveNames = Object.freeze(Object.keys(directivesWithExternalPath));
var composablesWithExternalPath = {
  useBreadcrumb: "/composables/useBreadcrumb",
  useColorMode: "/composables/useColorMode",
  useModal: "/composables/useModal",
  useModalController: "/composables/useModal",
  useScrollLock: "/composables/useScrollLock",
  useScrollspy: "/composables/useScrollspy",
  useToast: "/composables/useToast",
  useToastController: "/composables/useToast",
  useToggle: "/composables/useToggle",
  usePopover: "/composables/usePopover",
  usePopoverController: "/composables/usePopover",
  useRegistry: "/composables/useRegistry",
  useProvideDefaults: "/composables/useProvideDefaults",
  useOrchestratorRegistry: "/composables/orchestratorShared"
};
Object.freeze(Object.keys(composablesWithExternalPath));
Object.freeze(Object.keys({
  bordered: 0,
  borderless: 0,
  borderVariant: 0,
  captionTop: 0,
  dark: 0,
  fixed: 0,
  hover: 0,
  id: 0,
  noBorderCollapse: 0,
  outlined: 0,
  responsive: 0,
  small: 0,
  stacked: 0,
  stickyHeader: 0,
  striped: 0,
  stripedColumns: 0,
  variant: 0,
  tableAttrs: 0,
  tableClass: 0
}));
Object.freeze(Object.keys({
  align: 0,
  caption: 0,
  detailsTdClass: 0,
  fieldColumnClass: 0,
  fields: 0,
  footClone: 0,
  footRowVariant: 0,
  footVariant: 0,
  headRowVariant: 0,
  headVariant: 0,
  items: 0,
  labelStacked: 0,
  modelValue: 0,
  primaryKey: 0,
  tbodyClass: 0,
  tbodyTrAttrs: 0,
  tbodyTrClass: 0,
  tfootClass: 0,
  expandedItems: 0,
  tfootTrClass: 0,
  theadClass: 0,
  theadTrClass: 0
}));
var bvKey = "bootstrap-vue-next";
var parseActiveImports = (options, values) => {
  const { all, ...others } = options;
  const valuesCopy = {};
  if (all) values.forEach((el) => {
    valuesCopy[el] = all;
  });
  const merge = {
    ...valuesCopy,
    ...others
  };
  return Object.entries(merge).filter(([name, value]) => !!value && values.includes(name)).map(([name]) => name);
};
var usedComponents = /* @__PURE__ */ new Set();
var usedDirectives = /* @__PURE__ */ new Set();
Object.assign(({ aliases = {}, directives = true, components = true } = {}) => {
  const compImports = parseActiveImports(typeof components === "boolean" ? { all: components } : components, componentNames).reduce((map, name) => {
    map.set(name, `${bvKey}${componentsWithExternalPath[name]}`);
    return map;
  }, /* @__PURE__ */ new Map());
  const dirImports = parseActiveImports(typeof directives === "boolean" ? { all: directives } : directives, directiveNames).reduce((map, directive) => {
    const key = directive.toLowerCase().startsWith("v") ? directive : `v${directive}`;
    map.set(key, `${bvKey}${directivesWithExternalPath[key]}`);
    return map;
  }, /* @__PURE__ */ new Map());
  return [{
    type: "component",
    resolve(name) {
      const destination = compImports.get(name);
      const aliasDestination = aliases[name] === void 0 ? void 0 : compImports.get(aliases[name]);
      if (aliasDestination) {
        const val = aliases[name];
        if (val !== void 0) usedComponents.add(val);
        return {
          name: val,
          from: aliasDestination
        };
      }
      if (destination) {
        usedComponents.add(name);
        return {
          name,
          from: destination
        };
      }
    }
  }, {
    type: "directive",
    resolve(name) {
      const prefixedName = `v${name}`;
      const destination = dirImports.get(prefixedName);
      if (destination) {
        usedDirectives.add(prefixedName);
        return {
          name: prefixedName,
          from: destination
        };
      }
    }
  }];
}, {
  __usedComponents: usedComponents,
  __usedDirectives: usedDirectives
});
var rtlPlugin = { install(app, options) {
  var _a, _b;
  const rtlDefault = false;
  const localeDefault = void 0;
  const rtlInitial = typeof (options == null ? void 0 : options.rtl) === "boolean" ? rtlDefault : ((_a = options == null ? void 0 : options.rtl) == null ? void 0 : _a.rtlInitial) ?? rtlDefault;
  const localeInitial = typeof (options == null ? void 0 : options.rtl) === "boolean" ? localeDefault : ((_b = options == null ? void 0 : options.rtl) == null ? void 0 : _b.localeInitial) ?? localeDefault;
  const isRtl = /* @__PURE__ */ ref(rtlInitial);
  const locale = /* @__PURE__ */ ref(localeInitial);
  app.provide(rtlRegistryKey, {
    isRtl,
    locale
  });
} };
var registryPlugin = { install(app) {
  const { register, values } = _newShowHideRegistry();
  app.provide(showHideRegistryKey, {
    register,
    values
  });
  const items = /* @__PURE__ */ ref({ [breadcrumbGlobalIndexKey]: [] });
  const reset = (key = breadcrumbGlobalIndexKey) => {
    items.value[key] = [];
  };
  app.provide(breadcrumbRegistryKey, {
    items,
    reset
  });
  const stack2 = /* @__PURE__ */ ref(/* @__PURE__ */ new Map());
  const countStack = computed(() => stack2.value.size);
  const valuesStack = computed(() => [...stack2.value.values()]);
  const lastStack = computed(() => valuesStack.value[valuesStack.value.length - 1]);
  const pushStack = (modal) => {
    stack2.value.set(modal.uid, modal);
  };
  const removeStack = (modal) => {
    stack2.value.delete(modal.uid);
  };
  const registry = /* @__PURE__ */ ref(/* @__PURE__ */ new Map());
  const pushRegistry = (modal) => {
    registry.value.set(modal.uid, modal);
  };
  const removeRegistry = (modal) => {
    registry.value.delete(modal.uid);
  };
  app.provide(modalManagerKey, {
    countStack,
    lastStack,
    registry: computed(() => registry.value),
    stack: valuesStack,
    pushStack,
    removeStack,
    pushRegistry,
    removeRegistry
  });
} };
var orchestratorPlugin = { install(app) {
  const orchestratorRegistry = _newOrchestratorRegistry();
  app.provide(orchestratorRegistryKey, orchestratorRegistry);
} };
var createBootstrap = (pluginData = {}) => ({ install(app) {
  if ((pluginData.registries ?? true) === true) app.use(registryPlugin, pluginData);
  if ((pluginData.rtl ?? true) === true || typeof pluginData.rtl === "object") app.use(rtlPlugin, pluginData);
  if ((pluginData.orchestrator ?? true) === true) app.use(orchestratorPlugin);
  const val = (pluginData == null ? void 0 : pluginData.components) ?? {};
  app.provide(defaultsKey, /* @__PURE__ */ ref(val));
} });
const useVoiceStore = /* @__PURE__ */ defineStore("voice", () => {
  const mode = /* @__PURE__ */ ref("idle");
  const recording = /* @__PURE__ */ ref(false);
  const transcribing = /* @__PURE__ */ ref(false);
  const playing = /* @__PURE__ */ ref(false);
  const transcript = /* @__PURE__ */ ref([]);
  const statusText = /* @__PURE__ */ ref("Press and hold to talk");
  const genToken = /* @__PURE__ */ ref(0);
  const isOpen = computed(() => mode.value !== "idle");
  function openChatMode() {
    mode.value = "chat";
    transcript.value = [];
    statusText.value = "Press and hold to talk";
  }
  function openTaskCreatorMode() {
    mode.value = "task-creator";
    transcript.value = [];
    statusText.value = "Describe the task you want to create";
  }
  function close() {
    cancelAudio();
    mode.value = "idle";
    recording.value = false;
    transcribing.value = false;
    playing.value = false;
    transcript.value = [];
  }
  function cancelAudio() {
    genToken.value++;
    playing.value = false;
  }
  function addTranscript(entry) {
    transcript.value.push(entry);
  }
  function updateLastAssistant(text, state) {
    const last = transcript.value[transcript.value.length - 1];
    if (last && last.role === "assistant") {
      last.text = text;
      last.state = state;
    } else {
      transcript.value.push({ role: "assistant", text, state });
    }
  }
  return {
    mode,
    recording,
    transcribing,
    playing,
    transcript,
    statusText,
    genToken,
    isOpen,
    openChatMode,
    openTaskCreatorMode,
    close,
    cancelAudio,
    addTranscript,
    updateLastAssistant
  };
});
function stripMarkdown(text) {
  return text.replace(/```[\s\S]*?```/g, "").replace(/`[^`]+`/g, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/^#{1,6}\s+/gm, "").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1").replace(/^[-*+]\s+/gm, "").replace(/^\d+\.\s+/gm, "").replace(/^>\s+/gm, "").replace(/~~([^~]+)~~/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/_([^_]+)_/g, "$1").replace(/\|/g, "  ").replace(/^[-:|]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}
function esc(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function extractChunks(pending, isDone) {
  const chunks = [];
  let consumed = 0;
  const blocks = pending.split(/(\n\n+)/);
  let pos = 0;
  for (let b = 0; b < blocks.length; b++) {
    const part = blocks[b];
    if (/^\n\n+$/.test(part)) {
      pos += part.length;
      continue;
    }
    const hasTrailingSep = b + 1 < blocks.length && /^\n\n+$/.test(blocks[b + 1]);
    const isComplete = hasTrailingSep || isDone;
    if (isComplete) {
      const trimmed = part.trim();
      if (trimmed.length > 250) {
        const re = /[.!?]\s+/g;
        let m;
        let sentStart = 0;
        while ((m = re.exec(trimmed)) !== null) {
          const end = m.index + m[0].length;
          const sent = trimmed.slice(sentStart, end).trim();
          if (sent) chunks.push(sent);
          sentStart = end;
        }
        const tail = trimmed.slice(sentStart).trim();
        if (tail) chunks.push(tail);
      } else if (trimmed) {
        chunks.push(trimmed);
      }
      pos += part.length;
      consumed = pos;
    } else {
      const re2 = /[.!?]\s+/g;
      let m2;
      let sentStart2 = 0;
      let lastSentEnd = 0;
      while ((m2 = re2.exec(part)) !== null) {
        const end2 = m2.index + m2[0].length;
        const sent2 = part.slice(sentStart2, end2).trim();
        if (sent2) chunks.push(sent2);
        sentStart2 = end2;
        lastSentEnd = end2;
      }
      consumed = pos + lastSentEnd;
      break;
    }
  }
  return { chunks, consumed };
}
const MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm"
];
function detectMimeType() {
  if (typeof MediaRecorder === "undefined") return null;
  for (const c of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return null;
}
const _hoisted_1$1 = {
  class: "voice-mode-overlay",
  role: "dialog",
  "aria-modal": "true",
  "aria-live": "polite"
};
const _hoisted_2$1 = ["innerHTML"];
const _hoisted_3$1 = { class: "vm-controls" };
const _hoisted_4$1 = { class: "voice-mode-status" };
const HOLD_MS$1 = 250;
const _sfc_main$2 = /* @__PURE__ */ defineComponent({
  __name: "VoiceModeOverlay",
  setup(__props) {
    const voice = useVoiceStore();
    const mimeType = detectMimeType();
    let recorder = null;
    let chunks = [];
    let stream = null;
    let busy = false;
    let audioQueue = [];
    let queueRunning = false;
    let queueGen = 0;
    let currentAudio = null;
    let spokenChunks = [];
    let turnCursor = 0;
    let holdTimer = null;
    let holdMode = false;
    let pressStart = 0;
    let prevVmChunk;
    let fastPollController = null;
    const statusText = /* @__PURE__ */ ref("Press and hold to talk");
    const btnClass = /* @__PURE__ */ ref("");
    const transcriptHtml = /* @__PURE__ */ ref("");
    const isListening = /* @__PURE__ */ ref(false);
    function setStatus(text, cls) {
      statusText.value = text;
      btnClass.value = cls;
    }
    function renderTranscript() {
      if (!spokenChunks.length) {
        transcriptHtml.value = "";
        return;
      }
      transcriptHtml.value = spokenChunks.map((chunk, i) => {
        const active = i === spokenChunks.length - 1;
        return `<div class="vm-reply${active ? " vm-active" : ""}">${esc(chunk)}</div>`;
      }).join("");
    }
    function stopAudio() {
      queueGen++;
      if (fastPollController) {
        fastPollController.abort();
        fastPollController = null;
      }
      spokenChunks = [];
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
        currentAudio = null;
      }
      audioQueue = [];
      queueRunning = false;
      voice.playing = false;
      renderTranscript();
    }
    function enqueueChunk(chunkText) {
      const stripped = stripMarkdown(chunkText).trim();
      if (!stripped) return;
      const displayText = chunkText.trim();
      const gen = queueGen;
      const p2 = fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: stripped })
      }).then((res) => {
        if (gen !== queueGen) return null;
        if (!res.ok) {
          return res.json().catch(() => ({})).then(() => ({ audio: null, url: null, text: displayText }));
        }
        return res.blob().then((blob) => {
          if (gen !== queueGen) return null;
          const url = URL.createObjectURL(blob);
          return { audio: new Audio(url), url, text: displayText };
        });
      }).catch(() => ({ audio: null, url: null, text: displayText }));
      audioQueue.push(p2);
      if (!queueRunning) runQueue(gen);
    }
    async function runQueue(gen) {
      if (queueRunning) return;
      queueRunning = true;
      while (audioQueue.length > 0 && gen === queueGen) {
        const item = await audioQueue.shift();
        if (gen !== queueGen) {
          if (item == null ? void 0 : item.url) URL.revokeObjectURL(item.url);
          continue;
        }
        if (!item) continue;
        spokenChunks.push(item.text);
        renderTranscript();
        if (!item.audio) continue;
        setStatus("Speaking…", "speaking");
        voice.playing = true;
        currentAudio = item.audio;
        await new Promise((resolve2) => {
          item.audio.onended = () => {
            URL.revokeObjectURL(item.url);
            currentAudio = null;
            resolve2();
          };
          item.audio.onerror = () => {
            URL.revokeObjectURL(item.url);
            currentAudio = null;
            resolve2();
          };
          item.audio.play().catch(() => {
            URL.revokeObjectURL(item.url);
            currentAudio = null;
            resolve2();
          });
        });
      }
      if (gen === queueGen) {
        queueRunning = false;
        busy = false;
        voice.playing = false;
        if (voice.mode === "chat") setStatus("Press and hold to talk", "");
      }
    }
    function onAssistantChunk(fullText, isDone) {
      if (voice.mode !== "chat") return;
      if (fullText.length < turnCursor) {
        turnCursor = 0;
        stopAudio();
      }
      const pending = fullText.slice(turnCursor);
      if (!pending) return;
      const result = extractChunks(pending, isDone);
      if (result.consumed > 0) turnCursor += result.consumed;
      for (const chunk of result.chunks) {
        if (chunk.trim()) enqueueChunk(chunk);
      }
      if (result.chunks.length) busy = true;
    }
    async function streamChatReply(chatId) {
      var _a;
      if (!chatId) return;
      if (fastPollController) {
        fastPollController.abort();
      }
      const controller = new AbortController();
      fastPollController = controller;
      const gen = queueGen;
      while (!controller.signal.aborted && gen === queueGen) {
        await new Promise((r) => setTimeout(r, 200));
        if (controller.signal.aborted || gen !== queueGen) break;
        try {
          const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
            signal: controller.signal
          });
          if (!res.ok) break;
          const data = await res.json();
          if (!(data == null ? void 0 : data.ok) || !((_a = data == null ? void 0 : data.chat) == null ? void 0 : _a.messages)) continue;
          const msgs = data.chat.messages;
          const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
          if (!(lastAssistant == null ? void 0 : lastAssistant.text)) continue;
          const st = lastAssistant.state;
          const isDone = !st || st === "done";
          if (isDone || st === "streaming") {
            onAssistantChunk(lastAssistant.text, isDone);
            if (isDone && voice.mode === "chat") setStatus("Press and hold to talk", "");
          }
          if (isDone) break;
        } catch (e) {
          if ((e == null ? void 0 : e.name) === "AbortError") break;
          await new Promise((r) => setTimeout(r, 500));
        }
      }
      if (fastPollController === controller) fastPollController = null;
    }
    function stopStream() {
      stream == null ? void 0 : stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    async function startRecording() {
      if (busy || !mimeType) return;
      busy = true;
      stopAudio();
      setStatus("Requesting microphone…", "");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        setStatus("Microphone unavailable", "");
        busy = false;
        return;
      }
      chunks = [];
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        stopStream();
        setStatus("Press and hold to talk", "");
        busy = false;
        return;
      }
      recorder.ondataavailable = (e) => {
        var _a;
        if (((_a = e.data) == null ? void 0 : _a.size) > 0) chunks.push(e.data);
      };
      setStatus("Listening… (release to send)", "listening");
      transcriptHtml.value = "";
      isListening.value = true;
      voice.recording = true;
      recorder.start(200);
    }
    async function stopAndSubmit() {
      if (!recorder || recorder.state === "inactive") return;
      recorder.onstop = async () => {
        isListening.value = false;
        voice.recording = false;
        setStatus("Transcribing…", "processing");
        const blob = new Blob(chunks, { type: mimeType });
        chunks = [];
        recorder = null;
        stopStream();
        voice.transcribing = true;
        let text = "";
        try {
          const ext = mimeType.includes("webm") ? ".webm" : ".ogg";
          const fd = new FormData();
          fd.append("audio", blob, `vm-island${ext}`);
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (data.ok && data.text) {
            text = data.text.trim();
          } else {
            setStatus("Transcription failed — try again", "");
            busy = false;
            voice.transcribing = false;
            return;
          }
        } catch {
          setStatus("Request failed — try again", "");
          busy = false;
          voice.transcribing = false;
          return;
        }
        voice.transcribing = false;
        if (!text) {
          setStatus("Nothing heard — try again", "");
          busy = false;
          return;
        }
        transcriptHtml.value = `<div class="vm-heard">"${esc(text)}"</div>`;
        setStatus("Sending…", "processing");
        const chatId = window.__chatSessionId;
        try {
          await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text, chatId })
          });
          spokenChunks = [];
          turnCursor = 0;
          streamChatReply(chatId);
        } catch {
          console.error("[voice-island] chat send failed");
        }
        setStatus("Waiting for reply…", "processing");
      };
      recorder.stop();
    }
    function pressDown(e) {
      e.preventDefault();
      pressStart = Date.now();
      holdTimer = setTimeout(() => {
        holdMode = true;
        if (!busy && (!recorder || recorder.state === "inactive")) startRecording();
      }, HOLD_MS$1);
    }
    function pressUp(e) {
      e.preventDefault();
      if (holdTimer) clearTimeout(holdTimer);
      const dur = Date.now() - pressStart;
      if (holdMode) {
        holdMode = false;
        if ((recorder == null ? void 0 : recorder.state) !== "inactive") stopAndSubmit();
      } else if (dur < HOLD_MS$1) {
        if ((recorder == null ? void 0 : recorder.state) !== "inactive") stopAndSubmit();
        else if (!busy) startRecording();
      }
    }
    function pressLeave() {
      if (holdMode) {
        holdMode = false;
        if (holdTimer) clearTimeout(holdTimer);
        if ((recorder == null ? void 0 : recorder.state) !== "inactive") stopAndSubmit();
      }
    }
    function restoreVmHook() {
      window.__vmOnAssistantChunk = prevVmChunk;
      prevVmChunk = void 0;
    }
    function openMode() {
      busy = false;
      spokenChunks = [];
      turnCursor = 0;
      setStatus("Press and hold to talk", "");
      isListening.value = false;
      transcriptHtml.value = "";
      const hist = window.__chatHistory;
      if (Array.isArray(hist) && hist.length) {
        const last = hist[hist.length - 1];
        if ((last == null ? void 0 : last.role) === "assistant" && last.text) turnCursor = last.text.length;
      }
      prevVmChunk = window.__vmOnAssistantChunk;
      window.__vmOnAssistantChunk = onAssistantChunk;
    }
    function closeMode() {
      stopStream();
      stopAudio();
      busy = false;
      if ((recorder == null ? void 0 : recorder.state) !== "inactive") {
        recorder == null ? void 0 : recorder.stop();
        recorder = null;
      }
      restoreVmHook();
    }
    watch(
      () => voice.mode,
      (mode, prev) => {
        if (mode === "chat" && prev !== "chat") openMode();
        if (prev === "chat" && mode !== "chat") closeMode();
      }
    );
    onMounted(() => {
      if (voice.mode === "chat") openMode();
    });
    onBeforeUnmount(() => {
      stopStream();
      stopAudio();
      if (voice.mode === "chat") restoreVmHook();
    });
    function close() {
      closeMode();
      voice.close();
    }
    return (_ctx, _cache) => {
      return openBlock(), createElementBlock("div", _hoisted_1$1, [
        createBaseVNode("div", {
          class: "voice-mode-transcript",
          innerHTML: transcriptHtml.value
        }, null, 8, _hoisted_2$1),
        createBaseVNode("div", _hoisted_3$1, [
          createBaseVNode("div", _hoisted_4$1, toDisplayString(statusText.value), 1),
          createBaseVNode("button", {
            class: normalizeClass(["voice-mode-btn", btnClass.value]),
            type: "button",
            "aria-label": "Push to talk",
            onMousedown: pressDown,
            onTouchstart: withModifiers(pressDown, ["prevent"]),
            onMouseup: pressUp,
            onTouchend: withModifiers(pressUp, ["prevent"]),
            onMouseleave: pressLeave
          }, [
            createBaseVNode("i", {
              class: normalizeClass(isListening.value ? "fa-solid fa-stop" : "fa-solid fa-microphone")
            }, null, 2)
          ], 34),
          createBaseVNode("button", {
            class: "voice-mode-close",
            type: "button",
            "aria-label": "Exit voice mode",
            onClick: close
          }, [..._cache[0] || (_cache[0] = [
            createBaseVNode("i", { class: "fa-solid fa-xmark" }, null, -1)
          ])])
        ])
      ]);
    };
  }
});
const useTaskCreatorStore = /* @__PURE__ */ defineStore("task-creator", () => {
  const conversation = /* @__PURE__ */ ref([]);
  const draft = /* @__PURE__ */ ref(null);
  const submitting = /* @__PURE__ */ ref(false);
  const lastError = /* @__PURE__ */ ref(null);
  const createdTaskId = /* @__PURE__ */ ref(null);
  const SYSTEM_PROMPT = `You are a task-extraction assistant for a multi-agent system called Caravel. The user will describe a task they want to delegate to one of their AI agents. Your job is to extract the key fields and confirm back.

Known agents: alice (ops/admin), bob (code/dev), sam (strategy), ray (research), mark (marketing), cliff (code review).

Listen to the user's description and respond with:
1. A SHORT spoken acknowledgement (1-2 sentences, natural and direct)
2. Your extraction as a JSON block wrapped in <task> ... </task> tags

JSON fields:
- to: agent name (default "alice")
- headline: short task title (max 80 chars)
- brief: full task description as the agent will read it
- project: project slug if mentioned (e.g. "caravel"), or null
- priority: "P0"|"P1"|"P2"|"P3" (default "P2")
- kind: "research"|"code"|"review"|"summarise"|"decide"|"other" (default "research")

Do not ask clarifying questions unless a critical field is truly ambiguous. Make a sensible default call for anything unclear.

Example response:
"Got it — I'll set that up for Alice at P2.

<task>
{
  "to": "alice",
  "headline": "Summarise last week's completed tasks",
  "brief": "Review all tasks completed in the past 7 days across all agents and draft a short summary for Kelly, highlighting any patterns or blockers.",
  "project": "caravel",
  "priority": "P2",
  "kind": "summarise"
}
</task>"`;
  function reset() {
    conversation.value = [{ role: "system", text: SYSTEM_PROMPT }];
    draft.value = null;
    submitting.value = false;
    lastError.value = null;
    createdTaskId.value = null;
  }
  function addUserMessage(text) {
    conversation.value.push({ role: "user", text });
  }
  function addAssistantMessage(text) {
    conversation.value.push({ role: "assistant", text });
  }
  function parseTaskFromReply(reply) {
    const match = reply.match(/<task>\s*([\s\S]*?)\s*<\/task>/i);
    if (!match) return null;
    try {
      const obj = JSON.parse(match[1]);
      return {
        to: typeof obj.to === "string" ? obj.to : "alice",
        headline: typeof obj.headline === "string" ? obj.headline.slice(0, 80) : "New task",
        brief: typeof obj.brief === "string" ? obj.brief : "",
        project: typeof obj.project === "string" ? obj.project : null,
        priority: /^P[0-3]$/.test(obj.priority) ? obj.priority : "P2",
        kind: ["research", "code", "review", "summarise", "decide", "other"].includes(obj.kind) ? obj.kind : "research"
      };
    } catch {
      return null;
    }
  }
  function setDraft(d) {
    draft.value = { ...d };
  }
  function updateDraftField(field, value) {
    if (draft.value) {
      draft.value[field] = value;
    }
  }
  async function submitDraft() {
    if (!draft.value) return { ok: false, error: "No draft" };
    submitting.value = true;
    lastError.value = null;
    try {
      const payload = {
        to: draft.value.to,
        from: "user",
        kind: draft.value.kind,
        priority: draft.value.priority,
        headline: draft.value.headline,
        brief: draft.value.brief,
        project: draft.value.project || null
      };
      const res = await fetch("/api/tasks/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!data.ok) {
        lastError.value = data.error || "Unknown error";
        return { ok: false, error: lastError.value ?? "Unknown error" };
      }
      createdTaskId.value = data.id;
      return { ok: true, id: data.id };
    } catch (err) {
      lastError.value = String(err);
      return { ok: false, error: lastError.value ?? "Unknown error" };
    } finally {
      submitting.value = false;
    }
  }
  return {
    conversation,
    draft,
    submitting,
    lastError,
    createdTaskId,
    SYSTEM_PROMPT,
    reset,
    addUserMessage,
    addAssistantMessage,
    parseTaskFromReply,
    setDraft,
    updateDraftField,
    submitDraft
  };
});
const _hoisted_1 = {
  key: 0,
  class: "vtc-success text-center py-4"
};
const _hoisted_2 = {
  key: 0,
  class: "vtc-claude-reply mb-3 p-3 rounded"
};
const _hoisted_3 = { class: "row g-2 mb-2" };
const _hoisted_4 = { class: "col-6" };
const _hoisted_5 = { class: "col-6" };
const _hoisted_6 = { class: "d-flex gap-2 justify-content-end" };
const _hoisted_7 = {
  key: 2,
  class: "vtc-capture text-center py-3"
};
const _hoisted_8 = { class: "voice-mode-status mb-4" };
const _hoisted_9 = {
  key: 0,
  class: "vm-heard mt-2"
};
const _hoisted_10 = {
  key: 1,
  class: "vm-reply vm-active mt-2"
};
const HOLD_MS = 250;
const _sfc_main$1 = /* @__PURE__ */ defineComponent({
  __name: "VoiceTaskCreator",
  setup(__props) {
    const voice = useVoiceStore();
    const taskCreator = useTaskCreatorStore();
    const mimeType = detectMimeType();
    let recorder = null;
    let chunks = [];
    let stream = null;
    let busy = false;
    let audioQueue = [];
    let queueRunning = false;
    let queueGen = 0;
    let currentAudio = null;
    let pollTimer = null;
    const showModal = /* @__PURE__ */ ref(false);
    const statusText = /* @__PURE__ */ ref("Describe the task you want to create");
    const isListening = /* @__PURE__ */ ref(false);
    const isProcessing = /* @__PURE__ */ ref(false);
    const heardText = /* @__PURE__ */ ref("");
    const replyText = /* @__PURE__ */ ref("");
    const submitError = /* @__PURE__ */ ref("");
    const submitted = /* @__PURE__ */ ref(false);
    const draftTo = /* @__PURE__ */ ref("");
    const draftHeadline = /* @__PURE__ */ ref("");
    const draftBrief = /* @__PURE__ */ ref("");
    const draftProject = /* @__PURE__ */ ref("");
    const draftPriority = /* @__PURE__ */ ref("P2");
    const draftKind = /* @__PURE__ */ ref("research");
    const hasDraft = computed(() => taskCreator.draft !== null);
    const isSubmitting = computed(() => taskCreator.submitting);
    const priorityOptions = ["P0", "P1", "P2", "P3"];
    const kindOptions = ["research", "code", "review", "summarise", "decide", "other"];
    function stopAudio() {
      queueGen++;
      if (currentAudio) {
        currentAudio.pause();
        currentAudio.src = "";
        currentAudio = null;
      }
      audioQueue = [];
      queueRunning = false;
    }
    function enqueueChunk(chunkText) {
      const stripped = stripMarkdown(chunkText).trim();
      if (!stripped) return;
      const gen = queueGen;
      const p2 = fetch("/api/voice/speak", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: stripped })
      }).then((res) => {
        if (gen !== queueGen) return null;
        if (!res.ok) return { audio: null, url: null, text: chunkText };
        return res.blob().then((blob) => {
          if (gen !== queueGen) return null;
          const url = URL.createObjectURL(blob);
          return { audio: new Audio(url), url, text: chunkText };
        });
      }).catch(() => ({ audio: null, url: null, text: chunkText }));
      audioQueue.push(p2);
      if (!queueRunning) runQueue(gen);
    }
    async function runQueue(gen) {
      if (queueRunning) return;
      queueRunning = true;
      while (audioQueue.length > 0 && gen === queueGen) {
        const item = await audioQueue.shift();
        if (gen !== queueGen) {
          if (item == null ? void 0 : item.url) URL.revokeObjectURL(item.url);
          continue;
        }
        if (!(item == null ? void 0 : item.audio)) continue;
        currentAudio = item.audio;
        await new Promise((resolve2) => {
          item.audio.onended = () => {
            URL.revokeObjectURL(item.url);
            currentAudio = null;
            resolve2();
          };
          item.audio.onerror = () => {
            URL.revokeObjectURL(item.url);
            currentAudio = null;
            resolve2();
          };
          item.audio.play().catch(() => {
            URL.revokeObjectURL(item.url);
            currentAudio = null;
            resolve2();
          });
        });
      }
      if (gen === queueGen) queueRunning = false;
    }
    function speakReply(fullReply) {
      const spoken = fullReply.replace(/<task>[\s\S]*?<\/task>/gi, "").trim();
      if (!spoken) return;
      const sentences = spoken.match(/[^.!?]+[.!?]+/g) ?? [spoken];
      for (const s of sentences) {
        if (s.trim()) enqueueChunk(s.trim());
      }
    }
    function stopStream() {
      stream == null ? void 0 : stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    async function startRecording() {
      if (busy || !mimeType) return;
      busy = true;
      stopAudio();
      statusText.value = "Requesting microphone…";
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch {
        statusText.value = "Microphone unavailable";
        busy = false;
        return;
      }
      chunks = [];
      try {
        recorder = new MediaRecorder(stream, { mimeType });
      } catch {
        stopStream();
        statusText.value = "Describe the task you want to create";
        busy = false;
        return;
      }
      recorder.ondataavailable = (e) => {
        var _a;
        if (((_a = e.data) == null ? void 0 : _a.size) > 0) chunks.push(e.data);
      };
      statusText.value = "Listening… (release to send)";
      heardText.value = "";
      replyText.value = "";
      isListening.value = true;
      recorder.start(200);
    }
    async function stopAndExtract() {
      if (!recorder || recorder.state === "inactive") return;
      recorder.onstop = async () => {
        isListening.value = false;
        statusText.value = "Transcribing…";
        isProcessing.value = true;
        const blob = new Blob(chunks, { type: mimeType });
        chunks = [];
        recorder = null;
        stopStream();
        let text = "";
        try {
          const ext = mimeType.includes("webm") ? ".webm" : ".ogg";
          const fd = new FormData();
          fd.append("audio", blob, `task-creator${ext}`);
          const res = await fetch("/api/voice/transcribe", { method: "POST", body: fd });
          const data = await res.json();
          if (data.ok && data.text) {
            text = data.text.trim();
          } else {
            statusText.value = "Transcription failed — try again";
            busy = false;
            isProcessing.value = false;
            return;
          }
        } catch {
          statusText.value = "Request failed — try again";
          busy = false;
          isProcessing.value = false;
          return;
        }
        if (!text) {
          statusText.value = "Nothing heard — try again";
          busy = false;
          isProcessing.value = false;
          return;
        }
        heardText.value = text;
        statusText.value = "Extracting task…";
        taskCreator.addUserMessage(text);
        await extractTask(text);
        busy = false;
        isProcessing.value = false;
      };
      recorder.stop();
    }
    async function extractTask(userText) {
      const ephemeralChatId = `voice-task-${Date.now()}`;
      const embeddedMessage = buildEmbeddedMessage(userText);
      try {
        const postRes = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: embeddedMessage, chatId: ephemeralChatId })
        });
        const postData = await postRes.json();
        if (!postData.ok) {
          statusText.value = "Extraction failed — try again";
          return;
        }
      } catch {
        statusText.value = "Request failed — try again";
        return;
      }
      statusText.value = "Thinking…";
      const reply = await pollForReply(ephemeralChatId);
      if (!reply) {
        statusText.value = "No reply — try again";
        return;
      }
      taskCreator.addAssistantMessage(reply);
      replyText.value = reply;
      speakReply(reply);
      const draft = taskCreator.parseTaskFromReply(reply);
      if (draft) {
        taskCreator.setDraft(draft);
        draftTo.value = draft.to;
        draftHeadline.value = draft.headline;
        draftBrief.value = draft.brief;
        draftProject.value = draft.project ?? "";
        draftPriority.value = draft.priority;
        draftKind.value = draft.kind;
        statusText.value = "Review and confirm";
      } else {
        statusText.value = "Couldn't extract task — try again";
      }
    }
    function buildEmbeddedMessage(userText) {
      return `[VOICE TASK CREATOR — extract a task from the user's spoken request]

${taskCreator.SYSTEM_PROMPT}

---

User's voice request: "${userText}"`;
    }
    async function pollForReply(chatId, maxMs = 3e4) {
      const deadline = Date.now() + maxMs;
      while (Date.now() < deadline) {
        await delay3(600);
        try {
          const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`);
          const data = await res.json();
          if (!data.ok || !data.chat) continue;
          const messages = data.chat.messages ?? [];
          const last = messages[messages.length - 1];
          if (!last) continue;
          if (last.role === "assistant" && last.state === "done") return last.text ?? null;
          if (last.role === "assistant") {
            statusText.value = "Thinking…";
          }
        } catch {
        }
      }
      return null;
    }
    function delay3(ms) {
      return new Promise((resolve2) => {
        pollTimer = setTimeout(resolve2, ms);
      });
    }
    async function submitTask() {
      if (!taskCreator.draft) return;
      taskCreator.updateDraftField("to", draftTo.value);
      taskCreator.updateDraftField("headline", draftHeadline.value);
      taskCreator.updateDraftField("brief", draftBrief.value);
      taskCreator.updateDraftField("project", draftProject.value || null);
      taskCreator.updateDraftField("priority", draftPriority.value);
      taskCreator.updateDraftField("kind", draftKind.value);
      submitError.value = "";
      const result = await taskCreator.submitDraft();
      if (result.ok) {
        submitted.value = true;
        document.dispatchEvent(new CustomEvent("voice:task-created", { detail: { id: result.id } }));
        speakReply("Task created — I've queued it for you.");
        setTimeout(() => {
          if (voice.mode === "task-creator") voice.close();
        }, 3e3);
      } else {
        submitError.value = result.error ?? "Unknown error";
      }
    }
    let holdTimer2 = null;
    let holdMode = false;
    let pressStart = 0;
    function pressDown(e) {
      e.preventDefault();
      pressStart = Date.now();
      holdTimer2 = setTimeout(() => {
        holdMode = true;
        if (!busy && (!recorder || recorder.state === "inactive")) startRecording();
      }, HOLD_MS);
    }
    function pressUp(e) {
      e.preventDefault();
      if (holdTimer2) clearTimeout(holdTimer2);
      const dur = Date.now() - pressStart;
      if (holdMode) {
        holdMode = false;
        if ((recorder == null ? void 0 : recorder.state) !== "inactive") stopAndExtract();
      } else if (dur < HOLD_MS) {
        if ((recorder == null ? void 0 : recorder.state) !== "inactive") stopAndExtract();
        else if (!busy) startRecording();
      }
    }
    function pressLeave() {
      if (holdMode) {
        holdMode = false;
        if (holdTimer2) clearTimeout(holdTimer2);
        if ((recorder == null ? void 0 : recorder.state) !== "inactive") stopAndExtract();
      }
    }
    function openMode() {
      taskCreator.reset();
      busy = false;
      statusText.value = "Describe the task you want to create";
      isListening.value = false;
      isProcessing.value = false;
      heardText.value = "";
      replyText.value = "";
      submitError.value = "";
      submitted.value = false;
    }
    function closeMode() {
      stopStream();
      stopAudio();
      busy = false;
      if ((recorder == null ? void 0 : recorder.state) !== "inactive") {
        recorder == null ? void 0 : recorder.stop();
        recorder = null;
      }
      if (pollTimer) clearTimeout(pollTimer);
    }
    function cancel() {
      closeMode();
      voice.close();
    }
    function resetDraft() {
      taskCreator.reset();
      heardText.value = "";
      replyText.value = "";
      submitted.value = false;
      statusText.value = "Describe the task you want to create";
    }
    function onModalHide() {
      if (voice.mode === "task-creator") cancel();
    }
    watch(
      () => voice.mode,
      (mode, prev) => {
        if (mode === "task-creator" && prev !== "task-creator") {
          openMode();
          showModal.value = true;
        }
        if (prev === "task-creator" && mode !== "task-creator") {
          showModal.value = false;
          closeMode();
        }
      }
    );
    onMounted(() => {
      if (voice.mode === "task-creator") {
        openMode();
        showModal.value = true;
      }
    });
    onBeforeUnmount(() => {
      closeMode();
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(unref(BModal_default), {
        modelValue: showModal.value,
        "onUpdate:modelValue": _cache[6] || (_cache[6] = ($event) => showModal.value = $event),
        size: "lg",
        "no-close-on-backdrop": "",
        "hide-footer": "",
        scrollable: "",
        centered: "",
        onHide: onModalHide
      }, {
        title: withCtx(() => [..._cache[7] || (_cache[7] = [
          createBaseVNode("span", { class: "vtc-modal-title" }, [
            createBaseVNode("i", {
              class: "fa-solid fa-list-check me-2",
              style: { "color": "#6ee7b7" }
            }),
            createTextVNode(" Create a task from voice ")
          ], -1)
        ])]),
        default: withCtx(() => [
          submitted.value ? (openBlock(), createElementBlock("div", _hoisted_1, [..._cache[8] || (_cache[8] = [
            createBaseVNode("i", { class: "fa-solid fa-circle-check vtc-success-icon mb-3" }, null, -1),
            createBaseVNode("div", { class: "fw-medium fs-5" }, "Task created!", -1),
            createBaseVNode("div", { class: "text-secondary mt-1" }, "Closing in a moment…", -1)
          ])])) : hasDraft.value ? (openBlock(), createElementBlock(Fragment, { key: 1 }, [
            replyText.value ? (openBlock(), createElementBlock("div", _hoisted_2, [
              _cache[9] || (_cache[9] = createBaseVNode("small", { class: "text-secondary d-block mb-1" }, "Claude said", -1)),
              createTextVNode(" " + toDisplayString(replyText.value.replace(/<task>[\s\S]*?<\/task>/gi, "").trim()), 1)
            ])) : createCommentVNode("", true),
            createVNode(unref(BFormGroup_default), {
              label: "Agent",
              "label-for": "vtc-to",
              class: "mb-2"
            }, {
              default: withCtx(() => [
                createVNode(unref(BFormInput_default), {
                  id: "vtc-to",
                  modelValue: draftTo.value,
                  "onUpdate:modelValue": _cache[0] || (_cache[0] = ($event) => draftTo.value = $event),
                  size: "sm"
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            createBaseVNode("div", _hoisted_3, [
              createBaseVNode("div", _hoisted_4, [
                createVNode(unref(BFormGroup_default), {
                  label: "Priority",
                  "label-for": "vtc-priority"
                }, {
                  default: withCtx(() => [
                    createVNode(unref(BFormSelect_default), {
                      id: "vtc-priority",
                      modelValue: draftPriority.value,
                      "onUpdate:modelValue": _cache[1] || (_cache[1] = ($event) => draftPriority.value = $event),
                      size: "sm"
                    }, {
                      default: withCtx(() => [
                        (openBlock(), createElementBlock(Fragment, null, renderList(priorityOptions, (p2) => {
                          return createVNode(unref(BFormSelectOption_default), {
                            key: p2,
                            value: p2
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(p2), 1)
                            ]),
                            _: 2
                          }, 1032, ["value"]);
                        }), 64))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ]),
              createBaseVNode("div", _hoisted_5, [
                createVNode(unref(BFormGroup_default), {
                  label: "Kind",
                  "label-for": "vtc-kind"
                }, {
                  default: withCtx(() => [
                    createVNode(unref(BFormSelect_default), {
                      id: "vtc-kind",
                      modelValue: draftKind.value,
                      "onUpdate:modelValue": _cache[2] || (_cache[2] = ($event) => draftKind.value = $event),
                      size: "sm"
                    }, {
                      default: withCtx(() => [
                        (openBlock(), createElementBlock(Fragment, null, renderList(kindOptions, (k) => {
                          return createVNode(unref(BFormSelectOption_default), {
                            key: k,
                            value: k
                          }, {
                            default: withCtx(() => [
                              createTextVNode(toDisplayString(k), 1)
                            ]),
                            _: 2
                          }, 1032, ["value"]);
                        }), 64))
                      ]),
                      _: 1
                    }, 8, ["modelValue"])
                  ]),
                  _: 1
                })
              ])
            ]),
            createVNode(unref(BFormGroup_default), {
              label: "Project",
              "label-for": "vtc-project",
              class: "mb-2"
            }, {
              default: withCtx(() => [
                createVNode(unref(BFormInput_default), {
                  id: "vtc-project",
                  modelValue: draftProject.value,
                  "onUpdate:modelValue": _cache[3] || (_cache[3] = ($event) => draftProject.value = $event),
                  size: "sm",
                  placeholder: "(none)"
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            createVNode(unref(BFormGroup_default), {
              label: "Headline",
              "label-for": "vtc-headline",
              class: "mb-2"
            }, {
              default: withCtx(() => [
                createVNode(unref(BFormInput_default), {
                  id: "vtc-headline",
                  modelValue: draftHeadline.value,
                  "onUpdate:modelValue": _cache[4] || (_cache[4] = ($event) => draftHeadline.value = $event),
                  size: "sm"
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            createVNode(unref(BFormGroup_default), {
              label: "Brief",
              "label-for": "vtc-brief",
              class: "mb-3"
            }, {
              default: withCtx(() => [
                createVNode(unref(BFormTextarea_default), {
                  id: "vtc-brief",
                  modelValue: draftBrief.value,
                  "onUpdate:modelValue": _cache[5] || (_cache[5] = ($event) => draftBrief.value = $event),
                  rows: "4",
                  size: "sm"
                }, null, 8, ["modelValue"])
              ]),
              _: 1
            }),
            submitError.value ? (openBlock(), createBlock(unref(BAlert_default), {
              key: 1,
              variant: "danger",
              "model-value": true,
              class: "mb-3"
            }, {
              default: withCtx(() => [
                createTextVNode(toDisplayString(submitError.value), 1)
              ]),
              _: 1
            })) : createCommentVNode("", true),
            createBaseVNode("div", _hoisted_6, [
              createVNode(unref(BButton_default), {
                variant: "secondary",
                size: "sm",
                onClick: resetDraft
              }, {
                default: withCtx(() => [..._cache[10] || (_cache[10] = [
                  createBaseVNode("i", { class: "fa-solid fa-rotate-left me-1" }, null, -1),
                  createTextVNode(" Redo ", -1)
                ])]),
                _: 1
              }),
              createVNode(unref(BButton_default), {
                variant: "success",
                size: "sm",
                disabled: isSubmitting.value,
                onClick: submitTask
              }, {
                default: withCtx(() => [
                  _cache[11] || (_cache[11] = createBaseVNode("i", { class: "fa-solid fa-paper-plane me-1" }, null, -1)),
                  createTextVNode(" " + toDisplayString(isSubmitting.value ? "Creating…" : "Create Task"), 1)
                ]),
                _: 1
              }, 8, ["disabled"])
            ])
          ], 64)) : (openBlock(), createElementBlock("div", _hoisted_7, [
            createBaseVNode("div", _hoisted_8, toDisplayString(statusText.value), 1),
            createBaseVNode("button", {
              class: normalizeClass(["voice-mode-btn mx-auto mb-4", { listening: isListening.value, processing: isProcessing.value }]),
              type: "button",
              "aria-label": "Hold to describe task",
              onMousedown: pressDown,
              onTouchstart: withModifiers(pressDown, ["prevent"]),
              onMouseup: pressUp,
              onTouchend: withModifiers(pressUp, ["prevent"]),
              onMouseleave: pressLeave
            }, [
              createBaseVNode("i", {
                class: normalizeClass(isListening.value ? "fa-solid fa-stop" : "fa-solid fa-microphone")
              }, null, 2)
            ], 34),
            heardText.value ? (openBlock(), createElementBlock("div", _hoisted_9, '"' + toDisplayString(heardText.value) + '"', 1)) : createCommentVNode("", true),
            replyText.value ? (openBlock(), createElementBlock("div", _hoisted_10, toDisplayString(replyText.value), 1)) : createCommentVNode("", true)
          ]))
        ]),
        _: 1
      }, 8, ["modelValue"]);
    };
  }
});
const _export_sfc = (sfc, props) => {
  const target = sfc.__vccOpts || sfc;
  for (const [key, val] of props) {
    target[key] = val;
  }
  return target;
};
const VoiceTaskCreator = /* @__PURE__ */ _export_sfc(_sfc_main$1, [["__scopeId", "data-v-d872982b"]]);
const _sfc_main = /* @__PURE__ */ defineComponent({
  __name: "VoiceIsland",
  setup(__props) {
    const voice = useVoiceStore();
    function onOpenChatMode() {
      voice.openChatMode();
    }
    function onOpenTaskCreator() {
      voice.openTaskCreatorMode();
    }
    function onClose() {
      voice.close();
    }
    onMounted(() => {
      document.addEventListener("voice:open-chat-mode", onOpenChatMode);
      document.addEventListener("voice:open-task-creator", onOpenTaskCreator);
      document.addEventListener("voice:close", onClose);
      window.__voiceIslandReady = true;
      document.dispatchEvent(new CustomEvent("voice:island-ready"));
    });
    onBeforeUnmount(() => {
      document.removeEventListener("voice:open-chat-mode", onOpenChatMode);
      document.removeEventListener("voice:open-task-creator", onOpenTaskCreator);
      document.removeEventListener("voice:close", onClose);
    });
    return (_ctx, _cache) => {
      return openBlock(), createBlock(Teleport, { to: "body" }, [
        unref(voice).mode === "chat" ? (openBlock(), createBlock(_sfc_main$2, { key: 0 })) : createCommentVNode("", true),
        createVNode(VoiceTaskCreator)
      ]);
    };
  }
});
const pinia = createPinia();
createApp(_sfc_main).use(pinia).use(createBootstrap()).mount("#voice-island-root");
