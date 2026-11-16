// Breakless for JioHotstar (page context / MAIN world, document_start).
// Removes the player's ad "interventions" from page data before the app reads it
// (uBO: hotstar.com##+js(json-prune, success.page.spaces.player.widget_wrappers.[].widget.data.intervention_data)).
(() => {
  if (window.__blHotstarMain) return;
  Object.defineProperty(window, '__blHotstarMain', { value: true });

  const CFG_EVENT = '__bl_cfg_e1';
  const HELLO_EVENT = '__bl_hello_e1';
  const cfg = { hotstarEnabled: true };
  document.addEventListener(CFG_EVENT, (e) => {
    try { Object.assign(cfg, JSON.parse(String(e.detail))); } catch (_) {}
  });
  document.dispatchEvent(new CustomEvent(HELLO_EVENT));

  function findOwner(root, chain, prune = false) {
    let owner = root;
    for (;;) {
      if (typeof owner !== 'object' || owner === null) return false;
      const pos = chain.indexOf('.');
      if (pos === -1) {
        if (!prune) return Object.prototype.hasOwnProperty.call(owner, chain);
        if (Object.prototype.hasOwnProperty.call(owner, chain)) {
          delete owner[chain];
          return true;
        }
        return false;
      }
      const prop = chain.slice(0, pos);
      const next = chain.slice(pos + 1);
      if (prop === '[]' && Array.isArray(owner)) {
        let found = false;
        for (const item of owner) if (findOwner(item, next, prune)) found = true;
        return found;
      }
      if (!Object.prototype.hasOwnProperty.call(owner, prop)) return false;
      owner = owner[prop];
      chain = next;
    }
  }

  const PATHS = ['success.page.spaces.player.widget_wrappers.[].widget.data.intervention_data'];

  function prune(obj) {
    if (!cfg.hotstarEnabled || !obj || typeof obj !== 'object' || !('success' in obj)) return;
    for (const p of PATHS) {
      if (findOwner(obj, p, true)) console.debug('[Breakless] hotstar: removed ad interventions');
    }
  }

  const nativeParse = JSON.parse;
  JSON.parse = new Proxy(nativeParse, {
    apply(target, thisArg, args) {
      const result = Reflect.apply(target, thisArg, args);
      try { prune(result); } catch (_) {}
      return result;
    },
  });

  const nativeJson = Response.prototype.json;
  Response.prototype.json = new Proxy(nativeJson, {
    apply(target, thisArg, args) {
      return Reflect.apply(target, thisArg, args).then((obj) => {
        try { prune(obj); } catch (_) {}
        return obj;
      });
    },
  });
})();
