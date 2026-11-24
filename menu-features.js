/*
 * menu-features.js — "no more Error popups"
 * =========================================
 *
 * Loaded LAST (after back-nav-fix.js). It implements every Settings / Main
 * Menu / Activities feature that previously called comingSoon() (which was
 * just `notice("Error","Error")`) or showed a "not available right now" stub.
 *
 * Design rules:
 *   - No minified game logic is rewritten. Everything is layered on top via
 *     a single MutationObserver over #sList plus a handful of global hooks.
 *   - Every game call is guarded (try/catch + typeof), so a missing helper
 *     can never break the game.
 *   - All new state is plain JSON: account-wide data in localStorage,
 *     per-life data on state.mf (which saveLife() already persists).
 *   - No eval / Function / user JS. No network requests.
 */
(() => {
  "use strict";

  /* ------------------------------------------------------------------ *
   * 0. Config & persistence
   * ------------------------------------------------------------------ */
  const KEY = "bitlifepp-menu-features";
  const DEFAULTS = {
    v: 1,
    // Settings toggles
    accessibility: false, challenges: false, halfYear: false, haptics: false,
    language: "en",
    // Arcade
    tokens: 120, best: {}, plays: 0,
    // Challenges
    challenges: false, challengePoints: 0, challengeIds: [], challengeYear: -1, doneCount: 0,
    // Editors
    customCities: [], customPeople: [], teamNames: {}, teamDefaults: [],
    favorites: [], ownedPacks: [], ownedJobs: [],
    // Restore
    restoreBackup: null,
    // Help
    feedback: [],
    // Ventures (Expansion Packs)
    ventures: {},
    // Channels
    channels: {},
  };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  let cfg;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}");
    cfg = Object.assign(clone(DEFAULTS), raw && typeof raw === "object" ? raw : {});
    // shallow-merge nested defaults too
    for (const k of Object.keys(DEFAULTS)) {
      if (DEFAULTS[k] && typeof DEFAULTS[k] === "object" && !Array.isArray(DEFAULTS[k])) {
        cfg[k] = Object.assign(clone(DEFAULTS[k]), cfg[k] || {});
      }
      if (Array.isArray(DEFAULTS[k]) && !Array.isArray(cfg[k])) cfg[k] = clone(DEFAULTS[k]);
    }
  } catch (e) { cfg = clone(DEFAULTS); }

  function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

  // Per-life state. Plain JSON so the game's saveLife() deep-clone handles it.
  function life() {
    try {
      // `state` is a top-level `const` in the game's classic script: it is a
      // global lexical binding, not a property of window. Use typeof.
      if (typeof state === "undefined" || !state) return {};
      if (!state.mf || typeof state.mf !== "object") state.mf = {};
      return state.mf;
    } catch (e) { return {}; }
  }

  /* ------------------------------------------------------------------ *
   * 1. Small helpers
   * ------------------------------------------------------------------ */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const num = (v) => Number.isFinite(+v) ? +v : 0;
  const fmt = (n) => {
    try { if (typeof usd === "function") return usd(Math.round(n)); } catch (e) {}
    return "$" + Math.round(n).toLocaleString("en-US");
  };
  const clamp100 = (v) => Math.max(0, Math.min(100, v));

  function safe(fn, ...args) {
    try { return typeof fn === "function" ? fn.apply(null, args) : undefined; }
    catch (e) { if (window.console && console.warn) console.warn("menu-features:", e); return undefined; }
  }
  function play(kind) { safe(typeof window.play === "function" ? window.play : null, kind || "choice"); }
  function notify(title, msg, cb) {
    try {
      if (typeof window.notice === "function") { notice(title, msg, cb || null, !0); return; }
    } catch (e) {}
    try { window.alert(title + "\n\n" + msg); } catch (e) {}
  }
  function sayIt(text) {
    try { if (typeof window.say === "function") { say(text); return; } } catch (e) {}
    try {
      const log = document.getElementById("log");
      if (log && log.lastElementChild)
        log.lastElementChild.insertAdjacentHTML("beforeend", `<p>${esc(text)}</p>`);
    } catch (e) {}
  }
  function render() { safe(typeof window.renderStats === "function" ? window.renderStats : null); }
  function money(delta) {
    try {
      state.money = (num(state.money) + delta);
      render();
      return true;
    } catch (e) { return false; }
  }
  function canPay(cost) { try { return num(state.money) >= cost; } catch (e) { return false; } }
  function year() { try { return (num(state.birthYear) + num(state.age)); } catch (e) { return 0; } }
  function age() { try { return num(state.age); } catch (e) { return 0; } }
  function alive() { try { return !state.dead && !state.prison; } catch (e) { return true; } }

  // Screen helpers. All use the game's own chrome so the UI stays consistent.
  function showScreen(title, html, back) {
    try {
      try { delete sTitle.dataset.mfKey; } catch (e) {}
      sTitle.textContent = title;
      if (sSub) sSub.style.display = "none";
      if (sBack) {
        sBack.innerHTML = (typeof BACK_ICON !== "undefined" ? BACK_ICON : "&#8592;");
        sBack.onclick = back || openMainMenu;
      }
      sList.innerHTML = html;
      sList.scrollTop = 0;
      const scr = document.getElementById("screen"); if (scr) scr.classList.add("open");
      translateAll();
      speakScreen(title);
    } catch (e) { if (window.console) console.warn("menu-features screen", e); }
  }
  function row(icon, label, sub, attr, extra) {
    const img = icon ? `<img src="${esc(icon)}" alt="">` : "";
    return `<div class="row" ${attr || ""}>${img}<div class="t"><b>${esc(label)}</b>${sub ? `<span>${sub}</span>` : ""}</div>${extra || (typeof CHEV !== "undefined" ? CHEV : "")}</div>`;
  }
  const ICONS = {
    star: "emoji/2b50.png", gear: "ui/gear.png", trophy: "emoji/1f3c6.png",
    city: "menu/cityscape.png", people: "menu/hand-writing.png",
    sports: "menu/basketball.png", heart: "menu/heart-yellow.png",
    help: "menu/help-center.png", pack: "emoji/1f4bc.png", capitol: "politics/capitol.png",
    bag: "menu/shopping-bags.png", skull: "menu/skull-and-bones.png",
    globe: "emoji/1f30e.png", sound: "settings/sound.png",
    game: "settings/minigames.png", half: "settings/halfyear.png",
    challenge: "settings/challenges.png", haptic: "emoji/1f941.png",
    access: "emoji/1f5e3-fe0f.png", cart: "menu/cart.png",
    floppy: "menu/floppy-disk.png", users: "menu/users.png",
    moon: "menu/moon-crescent.png", hat: "menu/hat-womens.png",
    car: "cars/suv-red.png", house: "houses/house3.png",
    dice: "emoji/1f3b2.png", coin: "act/lottery.png",
    zoo: "act/zoo.png", pill: "health/vaccination.png",
    baby: "act/adoption.png", ticket: "act/sweepstakes.png",
  };
  const ico = (k) => ICONS[k] || ICONS.star;

  function setBoxVisual(rowEl, on) {
    const box = rowEl && rowEl.querySelector(".set-box");
    if (!box) return;
    box.classList.toggle("on", !!on);
    // The original renders a tick SVG that is hidden unless .on; also
    // make the background read like the game's own checkboxes.
    box.dataset.mfState = on ? "on" : "off";
  }

  /* ------------------------------------------------------------------ *
   * 2. CSS (one injected stylesheet, dark-mode safe)
   * ------------------------------------------------------------------ */
  function injectCSS() {
    if (document.getElementById("mfStyles")) return;
    const st = document.createElement("style");
    st.id = "mfStyles";
    st.textContent = `
.mf-wrap{padding:0 2px 18px}
.mf-lead{font-size:13px;line-height:1.5;opacity:.82;margin:8px 4px 14px}
.mf-sub{font-size:12px;opacity:.7;margin:2px 4px}
.mf-card{background:rgba(125,160,215,.10);border:1px solid rgba(128,128,128,.32);
  border-radius:10px;padding:12px;margin:8px 2px 14px}
.mf-card h4{margin:0 0 8px;font-size:15px}
.mf-muted{opacity:.68;font-size:12px}
.mf-big{font-size:22px;font-weight:900;letter-spacing:.5px}
.mf-bar{height:9px;border-radius:6px;background:rgba(128,128,128,.28);overflow:hidden;margin:5px 0 9px}
.mf-bar > u{display:block;height:100%;background:linear-gradient(90deg,#3fa0e0,#43c46b)}
.mf-bar.warn > u{background:linear-gradient(90deg,#e0a03f,#e04343)}
.mf-btn{display:inline-block;border:1px solid rgba(128,128,128,.4);border-radius:8px;
  padding:8px 12px;margin:4px 4px 4px 0;background:rgba(125,160,215,.14);
  color:inherit;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.mf-btn:hover{background:rgba(125,160,215,.28)}
.mf-btn.on{background:rgba(67,196,107,.28);border-color:#43c46b}
.mf-btn.danger{background:rgba(220,80,80,.18);border-color:rgba(220,80,80,.55)}
.mf-input{display:block;width:100%;box-sizing:border-box;margin:6px 0 10px;padding:9px 10px;
  border:1px solid rgba(128,128,128,.45);border-radius:8px;background:rgba(255,255,255,.10);
  color:inherit;font:inherit;font-size:14px}
.mf-input:focus{outline:2px solid #3f8fd8}
.mf-lab{display:block;font-size:12px;font-weight:800;margin:10px 0 2px;opacity:.8}
.mf-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin:12px 0}
.mf-tile{aspect-ratio:1;border:1px solid rgba(128,128,128,.4);border-radius:8px;
  background:rgba(125,160,215,.12);font-size:24px;display:grid;place-items:center;cursor:pointer;user-select:none}
.mf-tile.flip{background:rgba(255,255,255,.16)}
.mf-tile.done{background:rgba(67,196,107,.22);border-color:#43c46b}
.mf-tile:active{transform:scale(.96)}
.mf-reels{display:flex;justify-content:center;gap:8px;margin:14px 0}
.mf-reel{width:64px;height:72px;border:2px solid rgba(128,128,128,.45);border-radius:10px;
  background:rgba(255,255,255,.12);display:grid;place-items:center;font-size:38px}
.mf-inline{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0}
.mf-inline .mf-btn{margin:0}
.mf-chip{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:800;
  padding:5px 9px;border-radius:999px;background:rgba(125,160,215,.18);
  border:1px solid rgba(128,128,128,.35);cursor:pointer;max-width:100%}
.mf-chip b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.mf-row-actions{display:flex;gap:6px;align-items:center;flex:none}
.mf-mini{font-size:11px;font-weight:800;padding:5px 8px;border-radius:6px;
  border:1px solid rgba(128,128,128,.4);background:rgba(125,160,215,.12);color:inherit;cursor:pointer}
.mf-table{width:100%;border-collapse:collapse;font-size:13px;margin:8px 0}
.mf-table td,.mf-table th{padding:7px 6px;border-bottom:1px solid rgba(128,128,128,.22);text-align:left}
.mf-table th{font-size:11px;text-transform:uppercase;letter-spacing:.6px;opacity:.7}
.mf-tag{display:inline-block;font-size:10px;font-weight:900;padding:2px 6px;border-radius:5px;
  background:rgba(67,196,107,.22);border:1px solid #43c46b;margin-left:6px}
.mf-tag.off{background:rgba(128,128,128,.18);border-color:rgba(128,128,128,.5)}
.mf-chipbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:8px 4px}
.phone.dark .mf-input{background:rgba(255,255,255,.07)}
`;
    document.head.appendChild(st);
  }

  /* ------------------------------------------------------------------ *
   * 3. i18n — real translation layer
   * ------------------------------------------------------------------ */
  // Base strings are exact, whole-element text matches. Anything not in a
  // dictionary simply stays in English (standard i18n fallback behaviour).
  const LANGS = {
    en: { name: "English", m: {} },
    es: { name: "Español", m: {
      "MAIN MENU":"MENÚ PRINCIPAL","SETTINGS":"AJUSTES","ACTIVITIES":"ACTIVIDADES",
      "ASSETS":"PATRIMONIO","RELATIONSHIPS":"RELACIONES","OCCUPATION":"EMPLEO",
      "Back":"Atrás","Age":"Edad","New Life":"Nueva vida","Save Life":"Guardar vida",
      "View Past Lives":"Ver vidas anteriores","My Stuff":"Mis cosas","Community":"Comunidad",
      "Accessories":"Accesorios","Achievements":"Logros","Cemetery":"Cementerio",
      "Custom Cities":"Ciudades de EE. UU.","Custom People":"Personas personalizadas",
      "Edit Sports Teams":"Editar equipos","Favorite Activities":"Actividades favoritas",
      "Help":"Ayuda","Job Packs":"Paquetes de empleo","Expansion Packs":"Paquetes de expansión",
      "Themes":"Temas","Redeem Code":"Canjear código","Store":"Tienda","My Lives":"Mis vidas",
      "Collectibles":"Coleccionables","Stats":"Estadísticas","Configure":"Configurar",
      "Mod Workshop":"Taller de mods","Mods":"Mods","Packs":"Paquetes",
      "Languages":"Idiomas","Accessibility":"Accesibilidad","Announce Challenges":"Anunciar retos",
      "Bigger Text":"Texto más grande","Boosts":"Mejoras","Half-Year Age Up":"Envejecer cada medio año",
      "Haptics":"Vibración","Mini-Games":"Minijuegos","PC Mode":"Modo PC",
      "Sound Effects":"Efectos de sonido","Favorites":"Favoritos","Challenges":"Retos",
      "Arcade":"Recreativos","Tokens":"Fichas","Best":"Mejor","Score":"Puntuación",
      "Play":"Jugar","Save":"Guardar","Delete":"Eliminar","Edit":"Editar","Add":"Añadir",
      "Remove":"Quitar","Reset":"Restablecer","Apply":"Aplicar","Cancel":"Cancelar",
      "OK":"Aceptar","Close":"Cerrar","Done":"Hecho","Yes":"Sí","No":"No",
      "Confirm":"Confirmar","Success":"Éxito","Error":"Error","Cost":"Coste",
      "Reward":"Recompensa","Progress":"Progreso","Completed":"Completado",
      "Active":"Activo","Points":"Puntos","Free":"Gratis","Owned":"Adquirido",
      "Locked":"Bloqueado","Enable":"Activar","Disable":"Desactivar","All":"Todo",
      "Name":"Nombre","Country":"País","City":"Ciudad","Gender":"Género",
      "Search":"Buscar","Support":"Soporte","Feedback":"Comentarios",
      "Nothing here yet":"Todavía no hay nada","Not Enough Money":"Dinero insuficiente",
      "Thank you!":"¡Gracias!","Try Again":"Intentar de nuevo"
    }},
    fr: { name: "Français", m: {
      "MAIN MENU":"MENU PRINCIPAL","SETTINGS":"PARAMÈTRES","ACTIVITIES":"ACTIVITÉS",
      "ASSETS":"PATRIMOINE","RELATIONSHIPS":"RELATIONS","OCCUPATION":"EMPLOI",
      "Back":"Retour","Age":"Âge","New Life":"Nouvelle vie","Save Life":"Sauvegarder la vie",
      "View Past Lives":"Vies passées","My Stuff":"Mes affaires","Community":"Communauté",
      "Accessories":"Accessoires","Achievements":"Succès","Cemetery":"Cimetière",
      "Custom Cities":"Villes perso","Custom People":"Personnes perso",
      "Edit Sports Teams":"Modifier les équipes","Favorite Activities":"Activités favorites",
      "Help":"Aide","Job Packs":"Packs de métiers","Expansion Packs":"Extensions",
      "Themes":"Thèmes","Redeem Code":"Code à échanger","Store":"Boutique","My Lives":"Mes vies",
      "Collectibles":"Collections","Stats":"Statistiques","Configure":"Configurer",
      "Mod Workshop":"Atelier de mods","Mods":"Mods","Packs":"Packs",
      "Languages":"Langues","Accessibility":"Accessibilité","Announce Challenges":"Annoncer les défis",
      "Bigger Text":"Texte plus grand","Boosts":"Bonus","Half-Year Age Up":"Vieillir par semestre",
      "Haptics":"Vibrations","Mini-Games":"Mini-jeux","PC Mode":"Mode PC",
      "Sound Effects":"Effets sonores","Favorites":"Favoris","Challenges":"Défis",
      "Arcade":"Arcade","Tokens":"Jetons","Best":"Record","Score":"Score",
      "Play":"Jouer","Save":"Sauvegarder","Delete":"Supprimer","Edit":"Modifier","Add":"Ajouter",
      "Remove":"Retirer","Reset":"Réinitialiser","Apply":"Appliquer","Cancel":"Annuler",
      "OK":"OK","Close":"Fermer","Done":"Terminé","Yes":"Oui","No":"Non",
      "Confirm":"Confirmer","Success":"Succès","Error":"Erreur","Cost":"Coût",
      "Reward":"Récompense","Progress":"Progrès","Completed":"Terminé",
      "Active":"Actif","Points":"Points","Free":"Gratuit","Owned":"Possédé",
      "Locked":"Verrouillé","Enable":"Activer","Disable":"Désactiver","All":"Tout",
      "Name":"Nom","Country":"Pays","City":"Ville","Gender":"Genre",
      "Search":"Rechercher","Support":"Assistance","Feedback":"Avis",
      "Nothing here yet":"Rien pour l'instant","Not Enough Money":"Fonds insuffisants",
      "Thank you!":"Merci !","Try Again":"Réessayer"
    }},
    de: { name: "Deutsch", m: {
      "MAIN MENU":"HAUPTMENÜ","SETTINGS":"EINSTELLUNGEN","ACTIVITIES":"AKTIVITÄTEN",
      "ASSETS":"VERMÖGEN","RELATIONSHIPS":"BEZIEHUNGEN","OCCUPATION":"BERUF",
      "Back":"Zurück","Age":"Alter","New Life":"Neues Leben","Save Life":"Leben speichern",
      "View Past Lives":"Frühere Leben","My Stuff":"Meine Sachen","Community":"Community",
      "Accessories":"Accessoires","Achievements":"Erfolge","Cemetery":"Friedhof",
      "Custom Cities":"Eigene Städte","Custom People":"Eigene Personen",
      "Edit Sports Teams":"Teams umbenennen","Favorite Activities":"Lieblingsaktivitäten",
      "Help":"Hilfe","Job Packs":"Job-Pakete","Expansion Packs":"Erweiterungen",
      "Themes":"Designs","Redeem Code":"Code einlösen","Store":"Shop","My Lives":"Meine Leben",
      "Collectibles":"Sammlung","Stats":"Statistik","Configure":"Konfigurieren",
      "Mod Workshop":"Mod-Werkstatt","Mods":"Mods","Packs":"Pakete",
      "Languages":"Sprachen","Accessibility":"Barrierefreiheit","Announce Challenges":"Challenges anzeigen",
      "Bigger Text":"Größere Schrift","Boosts":"Boosts","Half-Year Age Up":"Halbjahres-Alterung",
      "Haptics":"Vibration","Mini-Games":"Minispiele","PC Mode":"PC-Modus",
      "Sound Effects":"Soundeffekte","Favorites":"Favoriten","Challenges":"Challenges",
      "Arcade":"Arcade","Tokens":"Chips","Best":"Bestwert","Score":"Punkte",
      "Play":"Spielen","Save":"Speichern","Delete":"Löschen","Edit":"Bearbeiten","Add":"Hinzufügen",
      "Remove":"Entfernen","Reset":"Zurücksetzen","Apply":"Anwenden","Cancel":"Abbrechen",
      "OK":"OK","Close":"Schließen","Done":"Fertig","Yes":"Ja","No":"Nein",
      "Confirm":"Bestätigen","Success":"Erfolg","Error":"Fehler","Cost":"Kosten",
      "Reward":"Belohnung","Progress":"Fortschritt","Completed":"Abgeschlossen",
      "Active":"Aktiv","Points":"Punkte","Free":"Kostenlos","Owned":"Besessen",
      "Locked":"Gesperrt","Enable":"Aktivieren","Disable":"Deaktivieren","All":"Alle",
      "Name":"Name","Country":"Land","City":"Stadt","Gender":"Geschlecht",
      "Search":"Suchen","Support":"Support","Feedback":"Feedback",
      "Nothing here yet":"Noch nichts hier","Not Enough Money":"Nicht genug Geld",
      "Thank you!":"Danke!","Try Again":"Nochmal versuchen"
    }},
    pt: { name: "Português", m: {
      "MAIN MENU":"MENU PRINCIPAL","SETTINGS":"CONFIGURAÇÕES","ACTIVITIES":"ATIVIDADES",
      "ASSETS":"PATRIMÔNIO","RELATIONSHIPS":"RELACIONAMENTOS","OCCUPATION":"EMPREGO",
      "Back":"Voltar","Age":"Idade","New Life":"Nova vida","Save Life":"Salvar vida",
      "View Past Lives":"Ver vidas passadas","My Stuff":"Minhas coisas","Community":"Comunidade",
      "Accessories":"Acessórios","Achievements":"Conquistas","Cemetery":"Cemitério",
      "Custom Cities":"Cidades personalizadas","Custom People":"Pessoas personalizadas",
      "Edit Sports Teams":"Editar times","Favorite Activities":"Atividades favoritas",
      "Help":"Ajuda","Job Packs":"Pacotes de emprego","Expansion Packs":"Pacotes de expansão",
      "Themes":"Temas","Redeem Code":"Resgatar código","Store":"Loja","My Lives":"Minhas vidas",
      "Collectibles":"Colecionáveis","Stats":"Estatísticas","Configure":"Configurar",
      "Mod Workshop":"Oficina de mods","Mods":"Mods","Packs":"Pacotes",
      "Languages":"Idiomas","Accessibility":"Acessibilidade","Announce Challenges":"Anunciar desafios",
      "Bigger Text":"Texto maior","Boosts":"Bônus","Half-Year Age Up":"Envelhecer por semestre",
      "Haptics":"Vibração","Mini-Games":"Minijogos","PC Mode":"Modo PC",
      "Sound Effects":"Efeitos sonoros","Favorites":"Favoritos","Challenges":"Desafios",
      "Arcade":"Arcade","Tokens":"Fichas","Best":"Recorde","Score":"Pontuação",
      "Play":"Jogar","Save":"Salvar","Delete":"Excluir","Edit":"Editar","Add":"Adicionar",
      "Remove":"Remover","Reset":"Redefinir","Apply":"Aplicar","Cancel":"Cancelar",
      "OK":"OK","Close":"Fechar","Done":"Concluído","Yes":"Sim","No":"Não",
      "Confirm":"Confirmar","Success":"Sucesso","Error":"Erro","Cost":"Custo",
      "Reward":"Recompensa","Progress":"Progresso","Completed":"Concluído",
      "Active":"Ativo","Points":"Pontos","Free":"Grátis","Owned":"Adquirido",
      "Locked":"Bloqueado","Enable":"Ativar","Disable":"Desativar","All":"Tudo",
      "Name":"Nome","Country":"País","City":"Cidade","Gender":"Gênero",
      "Search":"Buscar","Support":"Suporte","Feedback":"Comentários",
      "Nothing here yet":"Nada aqui ainda","Not Enough Money":"Dinheiro insuficiente",
      "Thank you!":"Obrigado!","Try Again":"Tentar de novo"
    }},
    it: { name: "Italiano", m: {
      "MAIN MENU":"MENU PRINCIPALE","SETTINGS":"IMPOSTAZIONI","ACTIVITIES":"ATTIVITÀ",
      "ASSETS":"PATRIMONIO","RELATIONSHIPS":"RELAZIONI","OCCUPATION":"LAVORO",
      "Back":"Indietro","Age":"Età","New Life":"Nuova vita","Save Life":"Salva vita",
      "View Past Lives":"Vite passate","My Stuff":"Le mie cose","Community":"Comunità",
      "Accessories":"Accessori","Achievements":"Obiettivi","Cemetery":"Cimitero",
      "Custom Cities":"Città personalizzate","Custom People":"Persone personalizzate",
      "Edit Sports Teams":"Modifica squadre","Favorite Activities":"Attività preferite",
      "Help":"Aiuto","Job Packs":"Pacchetti lavoro","Expansion Packs":"Espansioni",
      "Themes":"Temi","Redeem Code":"Riscatta codice","Store":"Negozio","My Lives":"Le mie vite",
      "Collectibles":"Collezionabili","Stats":"Statistiche","Configure":"Configura",
      "Mod Workshop":"Officina mod","Languages":"Lingue","Accessibility":"Accessibilità",
      "Announce Challenges":"Mostra sfide","Bigger Text":"Testo più grande",
      "Half-Year Age Up":"Invecchia ogni semestre","Haptics":"Vibrazione",
      "Mini-Games":"Minigiochi","PC Mode":"Modalità PC","Sound Effects":"Effetti sonori",
      "Favorites":"Preferiti","Challenges":"Sfide","Arcade":"Arcade","Tokens":"Gettoni",
      "Best":"Migliore","Score":"Punteggio","Play":"Gioca","Save":"Salva",
      "Delete":"Elimina","Edit":"Modifica","Add":"Aggiungi","Remove":"Rimuovi",
      "Reset":"Ripristina","Apply":"Applica","Cancel":"Annulla","OK":"OK",
      "Close":"Chiudi","Done":"Fatto","Yes":"Sì","No":"No","Confirm":"Conferma",
      "Success":"Successo","Error":"Errore","Cost":"Costo","Reward":"Ricompensa",
      "Progress":"Progresso","Completed":"Completato","Active":"Attivo","Points":"Punti",
      "Free":"Gratis","Owned":"Posseduto","Locked":"Bloccato","Enable":"Attiva",
      "Disable":"Disattiva","All":"Tutto","Name":"Nome","Country":"Paese",
      "City":"Città","Gender":"Genere","Search":"Cerca","Support":"Supporto",
      "Feedback":"Feedback","Nothing here yet":"Ancora niente qui",
      "Not Enough Money":"Fondi insufficienti","Thank you!":"Grazie!","Try Again":"Riprova"
    }},
    zh: { name: "简体中文", m: {
      "MAIN MENU":"主菜单","SETTINGS":"设置","ACTIVITIES":"活动","ASSETS":"资产",
      "RELATIONSHIPS":"人际关系","OCCUPATION":"职业","Back":"返回","Age":"年龄",
      "New Life":"新人生","Save Life":"保存人生","View Past Lives":"查看过往人生",
      "My Stuff":"我的物品","Community":"社区","Accessories":"配饰","Achievements":"成就",
      "Cemetery":"墓地","Custom Cities":"自定义城市","Custom People":"自定义人物",
      "Edit Sports Teams":"编辑球队","Favorite Activities":"常用活动","Help":"帮助",
      "Job Packs":"职业包","Expansion Packs":"扩展包","Themes":"主题","Redeem Code":"兑换码",
      "Store":"商店","My Lives":"我的人生","Collectibles":"收藏","Stats":"统计",
      "Configure":"配置","Mod Workshop":"模组工坊","Mods":"模组","Packs":"礼包",
      "Languages":"语言","Accessibility":"无障碍","Announce Challenges":"显示挑战",
      "Bigger Text":"更大字体","Boosts":"加成","Half-Year Age Up":"半年度成长",
      "Haptics":"震动","Mini-Games":"小游戏","PC Mode":"电脑模式","Sound Effects":"音效",
      "Favorites":"收藏","Challenges":"挑战","Arcade":"游戏厅","Tokens":"代币",
      "Best":"最佳","Score":"分数","Play":"开始","Save":"保存","Delete":"删除",
      "Edit":"编辑","Add":"添加","Remove":"移除","Reset":"重置","Apply":"应用",
      "Cancel":"取消","OK":"确定","Close":"关闭","Done":"完成","Yes":"是","No":"否",
      "Confirm":"确认","Success":"成功","Error":"错误","Cost":"费用","Reward":"奖励",
      "Progress":"进度","Completed":"已完成","Active":"进行中","Points":"积分",
      "Free":"免费","Owned":"已拥有","Locked":"未解锁","Enable":"启用","Disable":"停用",
      "All":"全部","Name":"姓名","Country":"国家","City":"城市","Gender":"性别",
      "Search":"搜索","Support":"支持","Feedback":"反馈","Nothing here yet":"暂无内容",
      "Not Enough Money":"资金不足","Thank you!":"谢谢！","Try Again":"再试一次"
    }},
    ja: { name: "日本語", m: {
      "MAIN MENU":"メインメニュー","SETTINGS":"設定","ACTIVITIES":"アクティビティ",
      "ASSETS":"資産","RELATIONSHIPS":"人間関係","OCCUPATION":"職業","Back":"戻る",
      "Age":"年齢","New Life":"新しい人生","Save Life":"人生を保存","View Past Lives":"過去の人生",
      "My Stuff":"マイアイテム","Community":"コミュニティ","Accessories":"アクセサリー",
      "Achievements":"実績","Cemetery":"墓地","Custom Cities":"自定义の都市",
      "Custom People":"自定义の人物","Edit Sports Teams":"チーム名を編集",
      "Favorite Activities":"お気に入り","Help":"ヘルプ","Job Packs":"職業パック",
      "Expansion Packs":"拡張パック","Themes":"テーマ","Redeem Code":"コードを入力",
      "Store":"ストア","My Lives":"自分の人生","Collectibles":"コレクション",
      "Stats":"統計","Configure":"設定項目","Mod Workshop":"MOD工房","Mods":"MOD",
      "Packs":"パック","Languages":"言語","Accessibility":"アクセシビリティ",
      "Announce Challenges":"チャレンジを表示","Bigger Text":"文字を大きく",
      "Boosts":"ブースト","Half-Year Age Up":"半年ごとに年齢を重ねる",
      "Haptics":"振動","Mini-Games":"ミニゲーム","PC Mode":"PCモード",
      "Sound Effects":"効果音","Favorites":"お気に入り","Challenges":"チャレンジ",
      "Arcade":"アーケード","Tokens":"トークン","Best":"ベスト","Score":"スコア",
      "Play":"プレイ","Save":"保存","Delete":"削除","Edit":"編集","Add":"追加",
      "Remove":"削除","Reset":"リセット","Apply":"適用","Cancel":"キャンセル",
      "OK":"OK","Close":"閉じる","Done":"完了","Yes":"はい","No":"いいえ",
      "Confirm":"確認","Success":"成功","Error":"エラー","Cost":"費用",
      "Reward":"報酬","Progress":"進捗","Completed":"達成済み","Active":"進行中",
      "Points":"ポイント","Free":"無料","Owned":"所有済み","Locked":"ロック",
      "Enable":"有効","Disable":"無効","All":"すべて","Name":"名前","Country":"国",
      "City":"都市","Gender":"性別","Search":"検索","Support":"サポート",
      "Feedback":"フィードバック","Nothing here yet":"まだ何もありません",
      "Not Enough Money":"お金が足りません","Thank you!":"ありがとう！","Try Again":"再挑戦"
    }},
    ko: { name: "한국어", m: {
      "MAIN MENU":"주 메뉴","SETTINGS":"설정","ACTIVITIES":"활동","ASSETS":"자산",
      "RELATIONSHIPS":"관계","OCCUPATION":"직업","Back":"뒤로","Age":"나이",
      "New Life":"새 인생","Save Life":"인생 저장","View Past Lives":"지난 인생 보기",
      "My Stuff":"내 물건","Community":"커뮤니티","Accessories":"액세서리",
      "Achievements":"업적","Cemetery":"묘지","Custom Cities":"사용자 지정 도시",
      "Custom People":"사용자 지정 인물","Edit Sports Teams":"팀 이름 편집",
      "Favorite Activities":"즐겨찾기","Help":"도움말","Job Packs":"직업 팩",
      "Expansion Packs":"확장 팩","Themes":"테마","Redeem Code":"코드 등록",
      "Store":"상점","My Lives":"내 인생","Collectibles":"수집품","Stats":"통계",
      "Configure":"구성","Mod Workshop":"모드 공방","Mods":"모드","Packs":"팩",
      "Languages":"언어","Accessibility":"접근성","Announce Challenges":"도전 과제 표시",
      "Bigger Text":"큰 글자","Boosts":"부스트","Half-Year Age Up":"반년 단위 성장",
      "Haptics":"진동","Mini-Games":"미니게임","PC Mode":"PC 모드",
      "Sound Effects":"효과음","Favorites":"즐겨찾기","Challenges":"도전 과제",
      "Arcade":"아케이드","Tokens":"토큰","Best":"최고 기록","Score":"점수",
      "Play":"플레이","Save":"저장","Delete":"삭제","Edit":"편집","Add":"추가",
      "Remove":"제거","Reset":"초기화","Apply":"적용","Cancel":"취소","OK":"확인",
      "Close":"닫기","Done":"완료","Yes":"예","No":"아니요","Confirm":"확인",
      "Success":"성공","Error":"오류","Cost":"비용","Reward":"보상",
      "Progress":"진행도","Completed":"완료","Active":"진행 중","Points":"포인트",
      "Free":"무료","Owned":"보유","Locked":"잠김","Enable":"켜기","Disable":"끄기",
      "All":"전체","Name":"이름","Country":"국가","City":"도시","Gender":"성별",
      "Search":"검색","Support":"지원","Feedback":"피드백",
      "Nothing here yet":"아직 아무것도 없습니다","Not Enough Money":"돈이 부족합니다",
      "Thank you!":"감사합니다!","Try Again":"다시 시도"
    }},
    ru: { name: "Русский", m: {
      "MAIN MENU":"ГЛАВНОЕ МЕНЮ","SETTINGS":"НАСТРОЙКИ","ACTIVITIES":"ДЕЙСТВИЯ",
      "ASSETS":"ИМУЩЕСТВО","RELATIONSHIPS":"ОТНОШЕНИЯ","OCCUPATION":"РАБОТА",
      "Back":"Назад","Age":"Возраст","New Life":"Новая жизнь","Save Life":"Сохранить жизнь",
      "View Past Lives":"Прошлые жизни","My Stuff":"Мои вещи","Community":"Сообщество",
      "Accessories":"Аксессуары","Achievements":"Достижения","Cemetery":"Кладбище",
      "Custom Cities":"Свои города","Custom People":"Свои персонажи",
      "Edit Sports Teams":"Изменить команды","Favorite Activities":"Избранное",
      "Help":"Помощь","Job Packs":"Наборы профессий","Expansion Packs":"Дополнения",
      "Themes":"Темы","Redeem Code":"Ввести код","Store":"Магазин","My Lives":"Мои жизни",
      "Collectibles":"Коллекция","Stats":"Статистика","Configure":"Настроить",
      "Mod Workshop":"Мастерская модов","Mods":"Моды","Packs":"Наборы",
      "Languages":"Языки","Accessibility":"Доступность","Announce Challenges":"Показывать задания",
      "Bigger Text":"Крупный текст","Boosts":"Бонусы","Half-Year Age Up":"Полугодовое взросление",
      "Haptics":"Вибрация","Mini-Games":"Мини-игры","PC Mode":"Режим ПК",
      "Sound Effects":"Звуки","Favorites":"Избранное","Challenges":"Задания",
      "Arcade":"Аркада","Tokens":"Жетоны","Best":"Рекорд","Score":"Счёт",
      "Play":"Играть","Save":"Сохранить","Delete":"Удалить","Edit":"Изменить",
      "Add":"Добавить","Remove":"Убрать","Reset":"Сбросить","Apply":"Применить",
      "Cancel":"Отмена","OK":"ОК","Close":"Закрыть","Done":"Готово","Yes":"Да","No":"Нет",
      "Confirm":"Подтвердить","Success":"Успех","Error":"Ошибка","Cost":"Цена",
      "Reward":"Награда","Progress":"Прогресс","Completed":"Завершено","Active":"Активно",
      "Points":"Очки","Free":"Бесплатно","Owned":"Куплено","Locked":"Заблокировано",
      "Enable":"Включить","Disable":"Выключить","All":"Все","Name":"Имя","Country":"Страна",
      "City":"Город","Gender":"Пол","Search":"Поиск","Support":"Поддержка",
      "Feedback":"Отзыв","Nothing here yet":"Пока ничего нет",
      "Not Enough Money":"Недостаточно денег","Thank you!":"Спасибо!","Try Again":"Ещё раз"
    }},
  };

  // Reverse map for the currently active language (translated -> English key).
  let reverse = {}, lowerMap = {};
  function buildReverse() {
    reverse = {};
    const dict = (LANGS[cfg.language] || LANGS.en).m;
    for (const k of Object.keys(dict)) reverse[dict[k]] = k;
    // Screen titles are UPPERCASE while dictionaries also carry Title Case
    // row labels. A case-insensitive index lets both resolve to one phrase.
    lowerMap = {};
    for (const code of Object.keys(LANGS))
      for (const k of Object.keys(LANGS[code].m))
        if (!lowerMap[k.toLowerCase()]) lowerMap[k.toLowerCase()] = k;
  }
  function canonical(base) {
    const dict = (LANGS[cfg.language] || LANGS.en).m;
    if (dict[base]) return base;
    const c = lowerMap[String(base).toLowerCase()];
    return c && dict[c] ? c : base;
  }
  buildReverse();

  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "SELECT", "OPTION", "CANVAS", "SVG", "PATH"]);
  function skip(el) {
    if (!el || el.nodeType !== 1) return true;
    if (SKIP_TAGS.has(el.tagName)) return true;
    if (el.id === "log" || (el.closest && el.closest("#log"))) return true;  // life story stays in its own language
    if (el.hasAttribute && (el.hasAttribute("data-mf-noi18n") || el.hasAttribute("contenteditable"))) return true;
    return false;
  }
  function translateEl(el) {
    if (skip(el)) return;
    if (cfg.language === "en") {
      // restore English from the stored key
      if (el.dataset && el.dataset.mfKey && !el.children.length) {
        el.textContent = el.dataset.mfKey;
        delete el.dataset.mfKey;
        delete el.dataset.mfText;
      }
      return;
    }
    const dict = (LANGS[cfg.language] || LANGS.en).m;
    // Only trust a stored key while the element still shows EXACTLY the text
    // we produced. The game re-renders sTitle/sList on every screen, so a
    // stale key must never overwrite a freshly written English title.
    const storedKey = el.dataset && el.dataset.mfKey;
    const storedText = el.dataset && el.dataset.mfText;
    let base;
    if (storedKey && storedText === el.textContent) base = storedKey;
    else {
      if (el.children.length) return;           // only leaf text nodes
      const raw = String(el.textContent || "");
      const txt = raw.trim();
      if (txt !== raw && raw.indexOf("\n") >= 0) return;
      base = reverse[txt] || txt;
    }
    const key = canonical(base);
    const out = dict[key];
    if (!out || out === key) return;
    try {
      el.dataset.mfKey = key;
      el.dataset.mfText = out;
      if (el.textContent !== out) el.textContent = out;
    } catch (e) {}
  }
  function translateTree(root) {
    if (cfg.language === "en") return;
    const nodes = root && root.nodeType === 1 ? [root, ...$$("*", root)] : [];
    for (const el of nodes) translateEl(el);
  }
  function translateAll() {
    try {
      // Restore every translated element to its English key and forget the key,
      // so a later language switch can re-derive it cleanly.
      $$("[data-mf-key]").forEach((el) => {
        try {
          if (!el.children.length) el.textContent = el.dataset.mfKey;
          delete el.dataset.mfKey;
          delete el.dataset.mfText;
        } catch (e) {}
      });
      buildReverse();
      if (cfg.language !== "en") translateTree(document.body);
    } catch (e) {}
  }
  function langName(code) { return (LANGS[code] || LANGS.en).name; }

  /* ------------------------------------------------------------------ *
   * 4. Accessibility — voice navigation (real, browser-backed)
   * ------------------------------------------------------------------ */
  let voicesOn = false;
  function voiceOK() { return typeof window.speechSynthesis !== "undefined" && typeof window.SpeechSynthesisUtterance !== "undefined"; }
  function speak(text, quiet) {
    if (!cfg.accessibility || !voiceOK() || !text) return;
    try {
      const t = String(text).replace(/\s+/g, " ").trim().slice(0, 220);
      if (!t) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t);
      u.lang = (LANGS[cfg.language] || LANGS.en).locale || "en-US";
      u.rate = 1.02; u.pitch = 1; u.volume = quiet ? .7 : 1;
      speechSynthesis.speak(u);
    } catch (e) {}
  }
  function speakScreen(title) { if (title) speak(title, true); }
  // Attach locales for better pronunciation.
  LANGS.en.locale = "en-US"; LANGS.es.locale = "es-ES"; LANGS.fr.locale = "fr-FR";
  LANGS.de.locale = "de-DE"; LANGS.pt.locale = "pt-BR"; LANGS.it.locale = "it-IT";
  LANGS.zh.locale = "zh-CN"; LANGS.ja.locale = "ja-JP"; LANGS.ko.locale = "ko-KR";
  LANGS.ru.locale = "ru-RU";

  let recognition = null;
  function startVoiceCommands() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) {
      notify("Voice Navigation", "This browser doesn't support speech recognition. Tap-to-read still works: tap any menu row and it will be read aloud.");
      return;
    }
    try {
      if (recognition) { recognition.stop(); recognition = null; }
      recognition = new R();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = (LANGS[cfg.language] || LANGS.en).locale || "en-US";
      recognition.onresult = (ev) => {
        const said = String((ev.results && ev.results[0] && ev.results[0][0] && ev.results[0][0].transcript) || "").toLowerCase();
        const go = (fn) => { try { fn(); speak("OK"); } catch (e) {} };
        if (/age|older|year/.test(said)) { const b = document.getElementById("ageBtn"); if (b) b.click(); }
        else if (/activit/.test(said)) go(() => window.openActivities && openActivities());
        else if (/relationship|family/.test(said)) go(() => window.openRelationships && openRelationships());
        else if (/asset|property|money/.test(said)) go(() => window.openAssets && openAssets());
        else if (/job|occupation|career/.test(said)) go(() => window.openOccupation && openOccupation());
        else if (/menu|home/.test(said)) go(() => window.openMainMenu && openMainMenu());
        else if (/setting/.test(said)) go(() => window.SETTINGS_UI && SETTINGS_UI.openSettings());
        else if (/back|close/.test(said)) go(() => { const b = document.getElementById("sBack"); if (b) b.click(); });
        else { speak("I didn't catch that. Try: age, activities, relationships, assets, occupation, settings or menu."); }
      };
      recognition.onerror = () => speak("Voice input stopped.");
      recognition.onend = () => { recognition = null; };
      recognition.start();
      speak("Listening. Say age, activities, relationships, assets, occupation, settings or menu.");
    } catch (e) { notify("Voice Navigation", "Voice commands couldn't start (" + (e && e.message ? e.message : "unknown") + "). Tap-to-read still works."); }
  }

  function openAccessibility() {
    const supported = voiceOK();
    showScreen("ACCESSIBILITY", `<div class="mf-wrap">
      <div class="mf-lead">Voice Navigation reads menus, rows and screens aloud, and can take simple voice commands. It uses your browser's built-in speech engine — nothing is sent anywhere.</div>
      <div class="mf-card">
        <h4>Status</h4>
        <div class="mf-inline"><span class="mf-tag ${cfg.accessibility ? "" : "off"}">${cfg.accessibility ? "ON" : "OFF"}</span>
        <span class="mf-muted">${supported ? "Speech engine available" : "Speech engine not available in this browser"}</span></div>
        <div class="mf-inline" style="margin-top:10px">
          <button class="mf-btn ${cfg.accessibility ? "on" : ""}" id="mfAccToggle">${cfg.accessibility ? "Turn off" : "Turn on"}</button>
          <button class="mf-btn" id="mfAccRead">Read this screen</button>
          <button class="mf-btn" id="mfAccVoice">Start voice command</button>
        </div>
      </div>
      <div class="sec">What it does</div>
      ${row(ico("access"), "Tap to read", "Tap any menu row, button or tab and it is spoken aloud", "")}
      ${row(ico("sound"), "Screen announcements", "Every new screen announces its title", "")}
      ${row(ico("star"), "Voice commands", "Say: age, activities, relationships, assets, occupation, settings, menu, back", "")}
      ${row(ico("globe"), "Follows your language", "Reads using the language selected in Settings → Languages", "")}
      <div class="mf-sub">Tip: Alt + R reads the current screen at any time, even outside Settings.</div>
    </div>`, openSettingsScreen);
    const t = $("#mfAccToggle");
    if (t) t.onclick = () => {
      cfg.accessibility = !cfg.accessibility; save();
      if (cfg.accessibility) { speak("Voice navigation on"); }
      else { try { if (voiceOK()) speechSynthesis.cancel(); } catch (e) {} }
      syncSettingsRows(); openAccessibility();
    };
    const r = $("#mfAccRead");
    if (r) r.onclick = () => speak("Accessibility. Voice navigation is " + (cfg.accessibility ? "on" : "off") + ". " + (supported ? "Speech engine available." : "Speech engine unavailable."), false);
    const v = $("#mfAccVoice");
    if (v) v.onclick = () => { if (!cfg.accessibility) { notify("Voice Navigation", "Turn Voice Navigation on first."); return; } startVoiceCommands(); };
  }

  /* ------------------------------------------------------------------ *
   * 5. Haptics — real navigator.vibrate feedback
   * ------------------------------------------------------------------ */
  function vibe(pattern) {
    if (!cfg.haptics) return;
    try { if (navigator.vibrate) navigator.vibrate(pattern); } catch (e) {}
  }
  function openHaptics() {
    const ok = typeof navigator !== "undefined" && !!navigator.vibrate;
    showScreen("HAPTICS", `<div class="mf-wrap">
      <div class="mf-lead">Haptics adds a short vibration to taps, purchases, wins and achievements. It only works on devices and browsers that support vibration.</div>
      <div class="mf-card"><h4>Status</h4>
        <div class="mf-inline"><span class="mf-tag ${cfg.haptics ? "" : "off"}">${cfg.haptics ? "ON" : "OFF"}</span>
        <span class="mf-muted">${ok ? "Vibration supported" : "Vibration not supported here (setting is still saved)"}</span></div>
        <div class="mf-inline" style="margin-top:10px">
          <button class="mf-btn ${cfg.haptics ? "on" : ""}" id="mfHapToggle">${cfg.haptics ? "Turn off" : "Turn on"}</button>
          <button class="mf-btn" id="mfHapTest">Test vibration</button>
        </div>
      </div>
      <div class="sec">Patterns</div>
      ${row(ico("haptic"), "Light tap", "10 ms on every tap", "")}
      ${row(ico("star"), "Success", "20 – 40 – 20 ms on a win or purchase", "")}
      ${row(ico("trophy"), "Achievement", "30 – 60 – 30 – 60 ms", "")}
    </div>`, openSettingsScreen);
    const t = $("#mfHapToggle");
    if (t) t.onclick = () => { cfg.haptics = !cfg.haptics; save(); vibe(cfg.haptics ? [15, 30, 15] : 10); syncSettingsRows(); openHaptics(); };
    const b = $("#mfHapTest");
    if (b) b.onclick = () => { const was = cfg.haptics; cfg.haptics = true; vibe([20, 40, 20, 40, 20]); cfg.haptics = was; notify("Haptics", ok ? "Did you feel that? That's the achievement pattern." : "This browser doesn't expose vibration, so there's nothing to feel — the setting is still saved for devices that do."); };
  }

  /* ------------------------------------------------------------------ *
   * 6. Half-Year Age Up — two presses per year of age
   * ------------------------------------------------------------------ */
  function halfTick() {
    try {
      const L = life();
      const lines = [
        "Six months went by. Not much happened.",
        "Half a year passed. I kept busy.",
        "The months slipped by quietly.",
        "Spring turned to summer, and nothing much changed.",
        "I spent the half-year working on myself.",
      ];
      sayIt(pick(lines));
      // Gentle half-year stat drift (the full year still runs on press 2).
      if (state.stats && typeof state.stats === "object") {
        for (const k of Object.keys(state.stats)) {
          if (Number.isFinite(state.stats[k])) state.stats[k] = clamp100(state.stats[k] + rnd(-1, 1));
        }
      }
      L.halfYears = (L.halfYears || 0) + 1;
      render();
      vibe(8);
      notify("Half-Year", "Six months passed. Tap Age again to complete the year.");
      updateChallengeChip();
    } catch (e) {}
  }
  function halfYearIntercept(e) {
    if (!cfg.halfYear) return true;
    const btn = e.target && e.target.closest ? e.target.closest("#ageBtn") : null;
    if (!btn) return true;
    // Respect the game's own "popup open" guard.
    try {
      if (document.querySelector(".notice-wrap") ||
          (typeof evWrap !== "undefined" && evWrap.classList.contains("open")) ||
          (typeof jmWrap !== "undefined" && jmWrap.classList.contains("open"))) return true;
    } catch (err) {}
    if (!alive()) return true;
    const L = life();
    const phase = (L.halfPhase || 0) + 1;      // 1 = first half, 2 = full year
    L.halfPhase = phase % 2;
    if (phase % 2 === 1) {
      // Block EVERY ageBtn listener (they are all bubble/target-phase, so a
      // document-level capture listener can stop them before they run).
      e.stopImmediatePropagation();
      e.preventDefault();
      play("choice");
      halfTick();
      return false;
    }
    return true;   // second press: let the real year happen
  }

  /* ------------------------------------------------------------------ *
   * 7. Challenges — real goals measured from your life
   * ------------------------------------------------------------------ */
  const CHALLENGES = [
    { id: "money50k", title: "Save up $50,000", desc: "Build your cash to $50,000.", goal: 50000, metric: () => num(state.money) },
    { id: "money250k", title: "Save up $250,000", desc: "Build your cash to $250,000.", goal: 250000, metric: () => num(state.money) },
    { id: "networth", title: "Reach $1,000,000 net worth", desc: "Cash, property, cars and heirlooms combined.", goal: 1000000, metric: () => { try { return num(netWorth()); } catch (e) { return num(state.money); } } },
    { id: "happy90", title: "Be truly happy", desc: "Get Happiness to 90%.", goal: 90, metric: () => num(state.stats && state.stats.Happiness) },
    { id: "health95", title: "Get fit", desc: "Get Health to 95%.", goal: 95, metric: () => num(state.stats && state.stats.Health) },
    { id: "smarts85", title: "Hit the books", desc: "Get Smarts to 85%.", goal: 85, metric: () => num(state.stats && state.stats.Smarts) },
    { id: "age30", title: "Make it to 30", desc: "Reach age 30 in this life.", goal: 30, metric: () => age() },
    { id: "age50", title: "Make it to 50", desc: "Reach age 50 in this life.", goal: 50, metric: () => age() },
    { id: "kids3", title: "Start a big family", desc: "Have 3 children.", goal: 3, metric: () => { try { return (state.family || []).filter((f) => f.kind === "child").length; } catch (e) { return 0; } } },
    { id: "cars3", title: "Fill the driveway", desc: "Own 3 cars.", goal: 3, metric: () => { try { return (state.cars || []).length; } catch (e) { return 0; } } },
    { id: "props2", title: "Property mogul", desc: "Own 2 properties.", goal: 2, metric: () => { try { return (state.props || []).length; } catch (e) { return 0; } } },
    { id: "friends5", title: "Popular", desc: "Have 5 friends at once.", goal: 5, metric: () => { try { return (state.friends || []).length; } catch (e) { return 0; } } },
    { id: "fame", title: "Get famous", desc: "Reach 75% fame.", goal: 75, metric: () => { try { return num(state.art && state.art.fame); } catch (e) { return 0; } } },
    { id: "pets3", title: "Animal lover", desc: "Own 3 pets.", goal: 3, metric: () => { try { return (state.pets || []).length; } catch (e) { return 0; } } },
    { id: "arcade", title: "Arcade regular", desc: "Play 10 mini-games.", goal: 10, metric: () => num(cfg.plays) },
    { id: "tokens", title: "Token collector", desc: "Hold 300 arcade tokens.", goal: 300, metric: () => num(cfg.tokens) },
  ];
  const byId = (id) => CHALLENGES.find((c) => c.id === id);

  function rollChallenges(force) {
    const y = year();
    if (!force && cfg.challengeYear === y && cfg.challengeIds && cfg.challengeIds.length) return;
    const pool = CHALLENGES.slice();
    // Shuffle and take 3; avoid ones already completed this season.
    for (let i = pool.length - 1; i > 0; i--) { const j = rnd(0, i); const t = pool[i]; pool[i] = pool[j]; pool[j] = t; }
    cfg.challengeIds = pool.slice(0, 3).map((c) => c.id);
    cfg.challengeYear = y;
    save();
  }
  function challengeProgress(c) {
    let v = 0;
    try { v = num(c.metric()); } catch (e) { v = 0; }
    return { value: v, pct: Math.min(100, Math.round(v / c.goal * 100)), done: v >= c.goal };
  }
  function checkChallenges(announce) {
    rollChallenges(false);
    let changed = false;
    const L = life();
    L.challengeDone = L.challengeDone || {};
    for (const id of cfg.challengeIds) {
      const c = byId(id); if (!c || L.challengeDone[id]) continue;
      const p = challengeProgress(c);
      if (p.done) {
        L.challengeDone[id] = true;
        cfg.challengePoints += 100;
        cfg.doneCount += 1;
        changed = true;
        sayIt(`I completed the challenge "${c.title}". (+100 challenge points)`);
        if (announce) {
          notify("Challenge complete!", `${c.title} — +100 points. You now have ${cfg.challengePoints} challenge points.`);
          vibe([30, 60, 30, 60]);
        }
      }
    }
    if (changed) save();
    updateChallengeChip();
  }
  function updateChallengeChip() {
    try {
      const bar = document.getElementById("mfChallengeBar");
      if (bar) {
        bar.innerHTML = cfg.challenges
          ? `<span class="mf-chip" id="mfChallengeChip"><span>&#127942;</span><b>${esc(topChallengeText())}</b></span>`
          : "";
        const chip = document.getElementById("mfChallengeChip");
        if (chip) chip.onclick = () => { play("choice"); openChallenges(); };
      }
    } catch (e) {}
  }
  function topChallengeText() {
    rollChallenges(false);
    const L = life(); L.challengeDone = L.challengeDone || {};
    const list = cfg.challengeIds.map(byId).filter(Boolean);
    const open = list.filter((c) => !L.challengeDone[c.id]);
    const c = open[0] || list[0];
    if (!c) return "Challenges";
    const p = challengeProgress(c);
    return L.challengeDone[c.id] ? `${c.title} ✓` : `${c.title} · ${p.pct}%`;
  }
  function openChallenges() {
    checkChallenges(false);
    rollChallenges(false);
    const L = life(); L.challengeDone = L.challengeDone || {};
    const list = cfg.challengeIds.map(byId).filter(Boolean);
    const cards = list.map((c) => {
      const p = challengeProgress(c);
      const done = !!L.challengeDone[c.id];
      return `<div class="mf-card"><h4>${esc(c.title)} <span class="mf-tag ${done ? "" : "off"}">${done ? "COMPLETED" : "ACTIVE"}</span></h4>
        <div class="mf-muted">${esc(c.desc)}</div>
        <div class="mf-bar"><u style="width:${p.pct}%"></u></div>
        <div class="mf-inline"><b>${esc(shortNum(p.value))} / ${esc(shortNum(c.goal))}</b><span class="mf-muted">${p.pct}%</span><span class="mf-muted" style="margin-left:auto">+100 pts</span></div></div>`;
    }).join("");
    showScreen("CHALLENGES", `<div class="mf-wrap">
      <div class="mf-lead">Three new challenges are picked each game year. Progress is measured live from your life — money, stats, family, property, pets and the arcade.</div>
      <div class="mf-card"><div class="mf-inline"><span class="mf-big">${cfg.challengePoints.toLocaleString("en-US")}</span><span class="mf-muted">challenge points</span><span class="mf-muted" style="margin-left:auto">${cfg.doneCount} completed</span></div></div>
      ${cards || '<div class="mf-lead">No challenges yet. Age up once to get your first set.</div>'}
      <div class="mf-inline"><button class="mf-btn" id="mfChReroll">New set (once per year)</button>
        <button class="mf-btn ${cfg.challenges ? "on" : ""}" id="mfChToggle">${cfg.challenges ? "Hide challenge banner" : "Show challenge banner"}</button></div>
      <div class="mf-sub">"Display new challenges" in Settings controls the banner shown in Activities and the Main Menu.</div>
    </div>`, openSettingsScreen);
    const r = $("#mfChReroll");
    if (r) r.onclick = () => {
      const L2 = life(); L2.rerollYear = L2.rerollYear || -1;
      if (L2.rerollYear === year()) { notify("Challenges", "You already took a new set this year. Age up for another."); return; }
      L2.rerollYear = year(); rollChallenges(true); play("choice"); openChallenges();
    };
    const t = $("#mfChToggle");
    if (t) t.onclick = () => {
      cfg.challenges = !cfg.challenges; save(); syncSettingsRows(); openChallenges(); updateChallengeChip();
    };
  }
  function shortNum(n) { return Math.abs(n) >= 1000000 ? (n / 1000000).toFixed(1) + "m" : Math.round(n).toLocaleString("en-US"); }

  /* ------------------------------------------------------------------ *
   * 8. ARCADE — illustrated, animated, full mini-games
   * ------------------------------------------------------------------ *
   * Everything in here uses a bespoke illustrated atlas (arcade/*.png),
   * CSS 3D animation, real sound cues and persistent scoring. No emoji,
   * no placeholder text, no full-screen re-renders mid-game.
   * ------------------------------------------------------------------ */

  /* 8x5 grid of 160px illustrated icons in arcade/sprites.png */
  const ARC_SPR = {
    "coin-h":[0,0], "coin-t":[1,0], "token":[2,0], "trophy":[3,0],
    "target":[4,0], "bolt":[5,0], "burst":[6,0], "confetti":[7,0],
    "heart":[0,1], "diamond":[1,1], "club":[2,1], "spade":[3,1],
    "cardback":[4,1], "joker":[5,1], "chip":[6,1], "dice":[7,1],
    "cherry":[0,2], "lemon":[1,2], "bell":[2,2], "star":[3,2],
    "gem":[4,2], "seven":[5,2], "bar":[6,2], "horseshoe":[7,2],
    "rocket":[0,3], "planet":[1,3], "crown":[2,3], "key":[3,3],
    "memgem":[4,3], "anchor":[5,3], "compass":[6,3], "moon":[7,3],
    "rock":[0,4], "paper":[1,4], "scissors":[2,4], "versus":[3,4],
    "win":[4,4], "lose":[5,4], "draw":[6,4], "medal":[7,4],
  };
  /* 3x2 grid of 256px covers in arcade/covers.png */
  const ARC_COVER = {
    coin:[0,0], higher:[1,0], memory:[2,0],
    slots:[0,1], reaction:[1,1], rps:[2,1],
  };
  const ARC_SLOT = [
    { k:"cherry", name:"Cherries", w:22, pay:100 },
    { k:"lemon",  name:"Lemon",    w:20, pay:100 },
    { k:"bell",   name:"Bell",     w:16, pay:130 },
    { k:"star",   name:"Star",     w:14, pay:160 },
    { k:"gem",    name:"Diamond",  w:10, pay:300 },
    { k:"seven",  name:"Lucky 7",  w:7,  pay:500 },
    { k:"bar",    name:"BAR",      w:7,  pay:200 },
    { k:"horseshoe", name:"Horseshoe", w:4, pay:350 },
  ];
  const ARC_MEM = ["rocket","planet","crown","key","memgem","anchor","compass","moon"];
  const ARC_SUITS = ["heart","diamond","club","spade"];
  const ARC_RANKS = { 11:"J", 12:"Q", 13:"K", 14:"A" };
  const ARC_GAMES = [
    { k:"coin",     title:"Coin Flip",          tag:"LUCK",     d:"Call it, build a streak, bank before you bust.",  c:"#ff4fa3" },
    { k:"higher",   title:"Higher or Lower",    tag:"CARDS",    d:"Read the deck. Push your luck or bank the pot.", c:"#4f8cff" },
    { k:"memory",   title:"Memory Match",       tag:"SKILL",    d:"Study, flip, combo. Beat the clock and the moves.",c:"#a77bff" },
    { k:"slots",    title:"Lucky Slots",        tag:"JACKPOT",  d:"Three spinning reels, a real paytable, free spins.",c:"#ff9a3c" },
    { k:"reaction", title:"Reaction Test",      tag:"SPEED",    d:"Five rounds. Timing, consistency and nerve.",     c:"#3fe8ff" },
    { k:"rps",      title:"Rock Paper Scissors",tag:"STRATEGY", d:"Best of five against an opponent that learns.",  c:"#43e08a" },
  ];

  const sp = (name, cls, style) => {
    const p = ARC_SPR[name] || ARC_SPR.token;
    return `<i class="arc-sp ${cls || ""}" style="background-position:${(p[0]/7*100).toFixed(4)}% ${(p[1]/4*100).toFixed(4)}%;${style || ""}"></i>`;
  };
  const cv = (name, cls, style) => {
    const p = ARC_COVER[name] || ARC_COVER.coin;
    return `<i class="arc-cv ${cls || ""}" style="background-position:${(p[0]/2*100).toFixed(4)}% ${(p[1]*100).toFixed(4)}%;${style || ""}"></i>`;
  };

  function arcCSS() {
    if (document.getElementById("arcStyles")) return;
    const s = document.createElement("style");
    s.id = "arcStyles";
    s.textContent = `
.arc-root{--a-cyan:#3fe8ff;--a-pink:#ff4fa3;--a-gold:#ffcf5c;--a-green:#43e08a;--a-red:#ff5d6c;
  position:relative;margin:-2px -2px 0;padding:10px 12px 22px;color:#edf2ff;
  background:radial-gradient(120% 70% at 50% -10%,rgba(80,45,160,.55),transparent 70%),
             linear-gradient(165deg,#101634 0%,#17123f 55%,#0b1026 100%);
  min-height:calc(100% - 4px);overflow:hidden;font-family:inherit}
.arc-root *{box-sizing:border-box}
.arc-root .arc-sp{display:inline-block;width:44px;height:44px;flex:none;
  background-image:url(arcade/sprites.png);background-size:800% 500%;background-repeat:no-repeat;
  vertical-align:middle;filter:drop-shadow(0 3px 6px rgba(0,0,0,.45))}
.arc-root .arc-cv{display:block;width:100%;height:100%;
  background-image:url(arcade/covers.png);background-size:300% 200%;background-repeat:no-repeat}
.arc-root .arc-sp.sm{width:28px;height:28px}.arc-root .arc-sp.xs{width:20px;height:20px}
.arc-root .arc-sp.lg{width:64px;height:64px}.arc-root .arc-sp.xl{width:96px;height:96px}
.arc-root .arc-sp.huge{width:128px;height:128px}
.arc-root h2,.arc-root h3,.arc-root h4{margin:0;color:#fff}
.arc-root .arc-hero{position:relative;height:132px;border-radius:14px;overflow:hidden;margin-bottom:12px;
  background:url(arcade/banner.png) center 38%/cover no-repeat;
  box-shadow:0 8px 28px rgba(0,0,0,.5),inset 0 0 0 1px rgba(160,140,255,.35)}
.arc-root .arc-hero:after{content:"";position:absolute;inset:0;
  background:linear-gradient(90deg,rgba(8,10,32,.86),rgba(8,10,32,.15) 62%,rgba(8,10,32,.55)),
             linear-gradient(0deg,rgba(8,10,32,.9),transparent 60%)}
.arc-root .arc-heroT{position:absolute;left:16px;bottom:16px;z-index:2}
.arc-root .arc-heroT b{display:block;font-size:30px;font-weight:900;letter-spacing:4px;
  color:#fff;text-shadow:0 0 18px rgba(120,110,255,.9),0 3px 8px #000}
.arc-root .arc-heroT span{display:block;font-size:11px;letter-spacing:2.4px;text-transform:uppercase;
  color:#b9c6ff;margin-top:3px;font-weight:800}
.arc-root .arc-hero .arc-heroFx{position:absolute;right:14px;bottom:18px;z-index:2;opacity:.95;
  animation:arc-float 3s ease-in-out infinite}
.arc-root .arc-hud{display:flex;align-items:center;gap:10px;padding:9px 12px;margin-bottom:12px;
  border-radius:12px;background:linear-gradient(90deg,rgba(255,207,92,.14),rgba(90,70,190,.12));
  border:1px solid rgba(255,207,92,.32);box-shadow:0 4px 18px rgba(0,0,0,.3)}
.arc-root .arc-hud b{font-size:20px;font-weight:900;color:#ffe6a3;font-variant-numeric:tabular-nums}
.arc-root .arc-hud .arc-lab{font-size:10px;letter-spacing:1.3px;text-transform:uppercase;opacity:.75;font-weight:800}
.arc-root .arc-hud .arc-right{margin-left:auto;text-align:right}
.arc-root .arc-games{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:6px 0 14px}
.arc-root .arc-game{position:relative;border-radius:13px;overflow:hidden;cursor:pointer;
  height:150px;background:#1a1c44;border:1px solid rgba(150,140,255,.28);
  box-shadow:0 6px 18px rgba(0,0,0,.38);transition:transform .18s cubic-bezier(.2,.8,.3,1.3),box-shadow .18s}
.arc-root .arc-game:hover,.arc-root .arc-game:active{transform:translateY(-3px) scale(1.015);
  box-shadow:0 12px 28px rgba(0,0,0,.55),0 0 0 1px rgba(160,150,255,.6)}
.arc-root .arc-game .arc-cv{position:absolute;inset:0;transition:transform .35s ease}
.arc-root .arc-game:hover .arc-cv{transform:scale(1.08)}
.arc-root .arc-game:after{content:"";position:absolute;inset:0;
  background:linear-gradient(0deg,rgba(6,8,26,.94) 0%,rgba(6,8,26,.62) 38%,rgba(6,8,26,.04) 72%)}
.arc-root .arc-game .arc-gInfo{position:absolute;left:10px;right:10px;bottom:9px;z-index:2}
.arc-root .arc-game .arc-gInfo b{display:block;font-size:13px;font-weight:900;line-height:1.2;text-shadow:0 2px 6px #000}
.arc-root .arc-game .arc-gInfo span{display:block;font-size:10px;opacity:.78;margin-top:2px}
.arc-root .arc-game .arc-tag{position:absolute;top:8px;left:8px;z-index:2;font-size:9px;font-weight:900;
  letter-spacing:1.2px;padding:3px 7px;border-radius:999px;background:rgba(8,10,32,.72);
  border:1px solid rgba(255,255,255,.28);color:#fff}
.arc-root .arc-game .arc-best{position:absolute;top:8px;right:8px;z-index:2;font-size:9px;font-weight:900;
  padding:3px 7px;border-radius:999px;background:rgba(255,207,92,.9);color:#241a04}
.arc-root .arc-sec{font-size:10px;font-weight:900;letter-spacing:2px;text-transform:uppercase;
  color:#9aa9e0;margin:14px 2px 8px;display:flex;align-items:center;gap:8px}
.arc-root .arc-sec:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(150,140,255,.45),transparent)}
.arc-root .arc-panel{border-radius:13px;padding:12px;margin:8px 0;
  background:linear-gradient(150deg,rgba(255,255,255,.075),rgba(255,255,255,.025));
  border:1px solid rgba(150,140,255,.24);box-shadow:0 5px 20px rgba(0,0,0,.28)}
.arc-root .arc-panel.flat{padding:10px 12px}
.arc-root .arc-title{font-size:16px;font-weight:900;letter-spacing:.4px}
.arc-root .arc-sub{font-size:11.5px;line-height:1.55;opacity:.76;margin:5px 0 9px}
.arc-root .arc-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:8px 0}
.arc-root .arc-row.tight{gap:5px}
.arc-root .arc-btn{appearance:none;border:1px solid rgba(180,170,255,.4);border-radius:10px;
  padding:9px 13px;font:inherit;font-size:12px;font-weight:900;letter-spacing:.4px;cursor:pointer;
  color:#eef2ff;background:linear-gradient(160deg,rgba(110,95,220,.42),rgba(60,50,140,.42));
  box-shadow:0 3px 0 rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.14);
  transition:transform .12s,filter .16s,box-shadow .12s}
.arc-root .arc-btn:hover{filter:brightness(1.22)}
.arc-root .arc-btn:active{transform:translateY(2px);box-shadow:0 1px 0 rgba(0,0,0,.35)}
.arc-root .arc-btn:disabled{opacity:.42;cursor:not-allowed;filter:grayscale(.5)}
.arc-root .arc-btn.primary{background:linear-gradient(160deg,#ff6bb2,#a32b8c);border-color:#ff9ccd}
.arc-root .arc-btn.gold{background:linear-gradient(160deg,#ffdb7a,#c5841d);border-color:#ffe6a8;color:#2a1c04}
.arc-root .arc-btn.ghost{background:rgba(255,255,255,.07)}
.arc-root .arc-btn.sm{padding:6px 10px;font-size:11px;border-radius:8px}
.arc-root .arc-btn.icon{padding:6px;line-height:0}
.arc-root .arc-seg{display:inline-flex;border-radius:10px;overflow:hidden;border:1px solid rgba(180,170,255,.36)}
.arc-root .arc-seg .arc-btn{border:0;border-radius:0;box-shadow:none;background:rgba(255,255,255,.06)}
.arc-root .arc-seg .arc-btn.on{background:linear-gradient(160deg,#ffdb7a,#c5841d);color:#2a1c04}
.arc-root .arc-chip{display:inline-flex;align-items:center;gap:5px;font-size:10.5px;font-weight:900;
  padding:5px 9px;border-radius:999px;background:rgba(255,255,255,.09);
  border:1px solid rgba(180,170,255,.3)}
.arc-root .arc-chip.on{background:rgba(67,224,138,.2);border-color:#43e08a;color:#b8ffd6}
.arc-root .arc-out{min-height:26px;font-size:13px;font-weight:900;text-align:center;margin-top:9px;
  letter-spacing:.2px;transition:opacity .2s}
.arc-root .arc-out.good{color:#8bffb8;text-shadow:0 0 14px rgba(67,224,138,.55)}
.arc-root .arc-out.bad{color:#ff9aa4;text-shadow:0 0 14px rgba(255,93,108,.5)}
.arc-root .arc-out.info{color:#bcd2ff}
.arc-root .arc-bar{height:8px;border-radius:6px;background:rgba(255,255,255,.11);overflow:hidden;margin:7px 0}
.arc-root .arc-bar > u{display:block;height:100%;border-radius:6px;
  background:linear-gradient(90deg,#3fe8ff,#a77bff,#ff4fa3);transition:width .4s ease}
.arc-root .arc-bar.gold > u{background:linear-gradient(90deg,#ffe6a3,#ffb03c)}
.arc-root .arc-bar.green > u{background:linear-gradient(90deg,#43e08a,#b8ffd6)}
.arc-root .arc-pips{display:flex;gap:5px;align-items:center}
.arc-root .arc-pip{width:11px;height:11px;border-radius:50%;background:rgba(255,255,255,.16);
  border:1px solid rgba(255,255,255,.28)}
.arc-root .arc-pip.on{background:linear-gradient(160deg,#ffe6a3,#ffb03c);border-color:#ffe6a3;
  box-shadow:0 0 9px rgba(255,190,70,.8)}
.arc-root .arc-table{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:7px}
.arc-root .arc-table td,.arc-root .arc-table th{padding:6px 5px;border-bottom:1px solid rgba(255,255,255,.1);text-align:left}
.arc-root .arc-table th{font-size:9px;letter-spacing:1.2px;text-transform:uppercase;opacity:.6;font-weight:900}
.arc-root .arc-table td:last-child,.arc-root .arc-table th:last-child{text-align:right}
.arc-root .arc-fx{position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:30}
.arc-root .arc-conf{position:absolute;width:9px;height:15px;top:-20px;opacity:.95;
  animation:arc-fall linear forwards}
.arc-root .arc-flash{position:absolute;inset:0;opacity:0;pointer-events:none;
  background:radial-gradient(circle at 50% 45%,rgba(255,255,255,.7),transparent 60%)}
.arc-root .arc-flash.go{animation:arc-flash .5s ease-out}
.arc-root .arc-back{display:flex;gap:7px;align-items:center;margin-top:14px;flex-wrap:wrap}

/* ---- Coin flip ---- */
.arc-root .arc-coinStage{position:relative;height:168px;display:grid;place-items:center;perspective:700px}
.arc-root .arc-coin3d{position:relative;width:124px;height:124px;transform-style:preserve-3d;
  --arc-mid:900deg;--arc-final:1800deg}
.arc-root .arc-coin3d.spin{animation:arc-toss 1.18s cubic-bezier(.26,.62,.24,1) forwards}
.arc-root .arc-face{position:absolute;inset:0;backface-visibility:hidden;
  background-image:url(arcade/sprites.png);background-size:800% 500%;background-repeat:no-repeat;
  background-position:0% 0%;filter:drop-shadow(0 10px 18px rgba(0,0,0,.55))}
.arc-root .arc-face.back{background-position:14.2857% 0%;transform:rotateY(180deg)}
.arc-root .arc-coinShadow{position:absolute;bottom:8px;width:96px;height:15px;border-radius:50%;
  background:radial-gradient(ellipse,rgba(0,0,0,.6),transparent 70%);
  animation:arc-shadow 1.18s cubic-bezier(.26,.62,.24,1) forwards}
.arc-root .arc-streak{display:flex;gap:4px;justify-content:center;margin:6px 0}
.arc-root .arc-streak i{width:26px;height:6px;border-radius:4px;background:rgba(255,255,255,.14)}
.arc-root .arc-streak i.on{background:linear-gradient(90deg,#ffb03c,#ffe6a3);box-shadow:0 0 9px rgba(255,180,60,.8)}
.arc-root .arc-history{display:flex;gap:4px;justify-content:center;flex-wrap:wrap;margin-top:6px}

/* ---- Cards ---- */
.arc-root .arc-cardStage{display:flex;align-items:center;justify-content:center;gap:18px;height:170px;perspective:800px}
.arc-root .arc-card{position:relative;width:104px;height:148px;transform-style:preserve-3d;
  transition:transform .55s cubic-bezier(.2,.8,.3,1)}
.arc-root .arc-card.flip{transform:rotateY(180deg)}
.arc-root .arc-card .arc-f,.arc-root .arc-card .arc-b{position:absolute;inset:0;border-radius:10px;
  backface-visibility:hidden;overflow:hidden;box-shadow:0 10px 24px rgba(0,0,0,.55)}
.arc-root .arc-card .arc-f{border:2px solid rgba(200,180,255,.7);
  background-image:url(arcade/sprites.png);background-size:800% 500%;background-position:57.1429% 25%}
.arc-root .arc-card .arc-b{transform:rotateY(180deg);background:linear-gradient(160deg,#fdfbff,#dfe4f5);
  border:2px solid #fff;color:#171c3a;display:flex;flex-direction:column;
  align-items:center;justify-content:center;gap:4px}
.arc-root .arc-card .arc-b .arc-rank{font-size:34px;font-weight:900;line-height:1}
.arc-root .arc-card .arc-b .arc-sp{width:40px;height:40px;filter:none}
.arc-root .arc-card.deal{animation:arc-deal .5s cubic-bezier(.2,.8,.3,1.2)}
.arc-root .arc-prob{display:flex;gap:6px;margin-top:8px}
.arc-root .arc-prob > div{flex:1;text-align:center;border-radius:9px;padding:7px 4px;
  background:rgba(255,255,255,.07);border:1px solid rgba(180,170,255,.22)}
.arc-root .arc-prob b{display:block;font-size:15px;font-weight:900;color:#ffe6a3}
.arc-root .arc-prob span{font-size:9px;letter-spacing:.8px;text-transform:uppercase;opacity:.7}

/* ---- Memory ---- */
.arc-root .arc-memGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin:10px 0}
.arc-root .arc-mem{position:relative;aspect-ratio:1;perspective:600px;cursor:pointer}
.arc-root .arc-mem .arc-in{position:absolute;inset:0;transform-style:preserve-3d;
  transition:transform .42s cubic-bezier(.2,.8,.3,1.15)}
.arc-root .arc-mem.flip .arc-in,.arc-root .arc-mem.done .arc-in{transform:rotateY(180deg)}
.arc-root .arc-mem .arc-mf,.arc-root .arc-mem .arc-mb{position:absolute;inset:0;border-radius:9px;
  backface-visibility:hidden;display:grid;place-items:center}
.arc-root .arc-mem .arc-mf{background:linear-gradient(150deg,#3a2a7a,#1b1748);
  border:1px solid rgba(180,160,255,.55);box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.arc-root .arc-mem .arc-mf .arc-sp{width:64%;height:64%;opacity:.92}
.arc-root .arc-mem .arc-mb{transform:rotateY(180deg);background:linear-gradient(150deg,#28315f,#111634);
  border:1px solid rgba(120,200,255,.4)}
.arc-root .arc-mem .arc-mb .arc-sp{width:78%;height:78%}
.arc-root .arc-mem.done .arc-mb{border-color:#43e08a;box-shadow:0 0 16px rgba(67,224,138,.5);
  animation:arc-match .5s ease-out}
.arc-root .arc-mem.wrong{animation:arc-shake .38s ease}
.arc-root .arc-mem.hint .arc-in{transform:rotateY(180deg)}
.arc-root .arc-timer{font-variant-numeric:tabular-nums;font-weight:900;color:#bcd2ff}

/* ---- Slots ---- */
.arc-root .arc-machine{border-radius:16px;padding:12px;background:linear-gradient(160deg,#2a1c60,#120e34);
  border:2px solid rgba(255,207,92,.5);box-shadow:0 0 30px rgba(160,90,255,.35),inset 0 2px 0 rgba(255,255,255,.14)}
.arc-root .arc-lights{display:flex;justify-content:space-around;margin-bottom:10px}
.arc-root .arc-lights i{width:9px;height:9px;border-radius:50%;background:#ffcf5c;
  box-shadow:0 0 9px #ffcf5c;animation:arc-blink 1.1s infinite alternate}
.arc-root .arc-reels{display:flex;gap:7px;justify-content:center;background:#080a20;
  border-radius:10px;padding:8px 6px;border:1px solid rgba(255,255,255,.16);
  box-shadow:inset 0 4px 12px rgba(0,0,0,.8)}
.arc-root .arc-reel{width:88px;height:88px;overflow:hidden;border-radius:8px;
  background:linear-gradient(180deg,#1b2050,#0a0c28);position:relative;flex:none}
.arc-root .arc-reel:after{content:"";position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(180deg,rgba(0,0,0,.6),transparent 28%,transparent 72%,rgba(0,0,0,.6))}
.arc-root .arc-strip{display:flex;flex-direction:column;will-change:transform}
.arc-root .arc-cell{height:88px;flex:none;display:grid;place-items:center}
.arc-root .arc-cell .arc-sp{width:66px;height:66px}
.arc-root .arc-reel.win{box-shadow:0 0 0 2px #ffcf5c,0 0 22px rgba(255,207,92,.9);
  animation:arc-winpulse .6s ease-in-out 3}
.arc-root .arc-pay{display:grid;grid-template-columns:repeat(4,1fr);gap:5px;margin-top:10px}
.arc-root .arc-pay > div{display:flex;align-items:center;gap:3px;font-size:9.5px;font-weight:900;
  background:rgba(255,255,255,.06);border-radius:7px;padding:4px 5px}
.arc-root .arc-pay .arc-sp{width:22px;height:22px}

/* ---- Reaction ---- */
.arc-root .arc-pad{position:relative;width:100%;height:190px;border-radius:16px;overflow:hidden;
  display:grid;place-items:center;cursor:pointer;user-select:none;
  border:2px solid rgba(255,255,255,.22);transition:background .16s,box-shadow .16s,transform .1s}
.arc-root .arc-pad:active{transform:scale(.985)}
.arc-root .arc-pad.idle{background:linear-gradient(160deg,#212a5e,#111634)}
.arc-root .arc-pad.wait{background:linear-gradient(160deg,#5c1c34,#2a1020);
  box-shadow:inset 0 0 40px rgba(255,80,100,.28)}
.arc-root .arc-pad.go{background:linear-gradient(160deg,#1c7a4c,#0b3a26);
  box-shadow:0 0 34px rgba(67,224,138,.65),inset 0 0 40px rgba(120,255,180,.35)}
.arc-root .arc-pad.bad{background:linear-gradient(160deg,#7a1c1c,#3a0e0e)}
.arc-root .arc-pad:before{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;
  background:url(arcade/covers.png) 50% 100%/300% 200% no-repeat;opacity:.19}
.arc-root .arc-padMsg{position:relative;z-index:3;text-align:center;font-weight:900;letter-spacing:1px}
.arc-root .arc-padMsg b{display:block;font-size:25px;color:#fff;text-shadow:0 3px 12px rgba(0,0,0,.6)}
.arc-root .arc-padMsg span{display:block;font-size:11px;opacity:.8;margin-top:4px;letter-spacing:1.5px;text-transform:uppercase}
.arc-root .arc-padRing{position:absolute;width:70px;height:70px;border-radius:50%;
  border:3px solid rgba(255,255,255,.5);opacity:0}
.arc-root .arc-pad.wait .arc-padRing{animation:arc-ring 1.4s ease-out infinite}
.arc-root .arc-pad.go .arc-padRing{animation:arc-ringGo .45s ease-out}
.arc-root .arc-lights3{display:flex;gap:8px;justify-content:center;margin:10px 0}
.arc-root .arc-lights3 i{width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.15);
  border:1px solid rgba(255,255,255,.3);transition:all .15s}
.arc-root .arc-lights3 i.r{background:#ff5d6c;box-shadow:0 0 12px #ff5d6c}
.arc-root .arc-lights3 i.a{background:#ffcf5c;box-shadow:0 0 12px #ffcf5c}
.arc-root .arc-lights3 i.g{background:#43e08a;box-shadow:0 0 12px #43e08a}
.arc-root .arc-bigNum{font-size:38px;font-weight:900;letter-spacing:1px;text-align:center;
  color:#ffe6a3;text-shadow:0 0 22px rgba(255,207,92,.55);font-variant-numeric:tabular-nums}

/* ---- RPS ---- */
.arc-root .arc-arena{display:flex;align-items:center;justify-content:space-between;gap:8px;
  position:relative;overflow:hidden;padding:14px 8px;border-radius:14px;
  background:linear-gradient(90deg,rgba(63,232,255,.12),rgba(20,16,52,.55) 50%,rgba(255,79,163,.12));
  border:1px solid rgba(180,170,255,.28);
  box-shadow:inset 0 0 30px rgba(0,0,0,.45),0 0 22px rgba(90,60,190,.22)}
.arc-root .arc-arena:before{content:"";position:absolute;inset:0;pointer-events:none;
  background:radial-gradient(circle at 22% 55%,rgba(63,232,255,.30),transparent 46%),
             radial-gradient(circle at 78% 55%,rgba(255,79,163,.30),transparent 46%)}
.arc-root .arc-arena:after{content:"";position:absolute;left:50%;top:8%;bottom:8%;width:1px;
  background:linear-gradient(180deg,transparent,rgba(200,190,255,.5),transparent);pointer-events:none}
.arc-root .arc-hand{width:106px;height:106px;display:grid;place-items:center;position:relative;z-index:1;flex:none}
.arc-root .arc-hand .arc-sp{width:102px;height:102px;
  filter:drop-shadow(0 7px 13px rgba(0,0,0,.65)) drop-shadow(0 0 15px rgba(120,130,255,.55))}
.arc-root .arc-hand.shake{animation:arc-shakeHand .48s ease-in-out infinite}
.arc-root .arc-hand.reveal{animation:arc-pop .42s cubic-bezier(.2,.8,.3,1.5)}
.arc-root .arc-hand.cpu .arc-sp{transform:scaleX(-1)}
.arc-root .arc-vs{text-align:center;flex:1;position:relative;z-index:1}
.arc-root .arc-vs .arc-sp{width:46px;height:46px}
.arc-root .arc-vs b{display:block;font-size:11px;letter-spacing:2px;margin-top:3px;opacity:.8}
.arc-root .arc-score{display:flex;justify-content:center;gap:22px;margin:12px 0 4px}
.arc-root .arc-score > div{text-align:center}
.arc-root .arc-score span{display:block;font-size:9px;letter-spacing:1.6px;text-transform:uppercase;opacity:.7;font-weight:900}
.arc-root .arc-score .arc-pips{margin-top:5px;justify-content:center}
.arc-root .arc-hist{display:flex;gap:4px;justify-content:center;flex-wrap:wrap;margin-top:10px}
.arc-root .arc-hist .arc-sp{width:24px;height:24px}
.arc-root .arc-btn .arc-sp.sm{width:34px;height:34px;
  filter:drop-shadow(0 0 7px rgba(120,140,255,.65))}
.arc-root .arc-btn:has(.arc-sp.sm){padding:7px 12px 7px 8px}

/* ---- Shared keyframes ---- */
@keyframes arc-float{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-8px) rotate(4deg)}}
@keyframes arc-fall{0%{transform:translateY(0) rotate(0);opacity:1}100%{transform:translateY(560px) rotate(760deg);opacity:0}}
@keyframes arc-flash{0%{opacity:.85}100%{opacity:0}}
@keyframes arc-pop{0%{transform:scale(.35);opacity:0}70%{transform:scale(1.16);opacity:1}100%{transform:scale(1)}}
@keyframes arc-shake{0%,100%{transform:translateX(0)}20%{transform:translateX(-6px)}
  40%{transform:translateX(6px)}60%{transform:translateX(-4px)}80%{transform:translateX(4px)}}
@keyframes arc-blink{from{opacity:.35}to{opacity:1}}
@keyframes arc-winpulse{0%,100%{filter:brightness(1)}50%{filter:brightness(1.5)}}
@keyframes arc-toss{0%{transform:translateY(0) rotateY(0deg)}
  48%{transform:translateY(-76px) rotateY(var(--arc-mid))}
  100%{transform:translateY(0) rotateY(var(--arc-final))}}
@keyframes arc-shadow{0%{transform:scale(1);opacity:.75}48%{transform:scale(.55);opacity:.25}100%{transform:scale(1);opacity:.75}}
@keyframes arc-deal{0%{transform:translate(70px,-40px) rotate(18deg) scale(.8);opacity:0}
  100%{transform:translate(0,0) rotate(0) scale(1);opacity:1}}
@keyframes arc-match{0%{box-shadow:0 0 0 rgba(67,224,138,0)}50%{box-shadow:0 0 24px rgba(67,224,138,.95)}100%{box-shadow:0 0 16px rgba(67,224,138,.5)}}
@keyframes arc-ring{0%{transform:scale(.4);opacity:.8}100%{transform:scale(3.2);opacity:0}}
@keyframes arc-ringGo{0%{transform:scale(.5);opacity:1}100%{transform:scale(2.6);opacity:0}}
@keyframes arc-shakeHand{0%,100%{transform:translateY(0) rotate(-5deg)}50%{transform:translateY(-10px) rotate(5deg)}}
@keyframes arc-spinBlur{0%{filter:blur(0)}50%{filter:blur(2.5px)}100%{filter:blur(0)}}
@keyframes arc-shimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}
`;
    document.head.appendChild(s);
  }

  /* ---- session lifecycle ---------------------------------------------- */
  let arcTimers = [], arcRafs = [], arcInterval = null;
  function arcLater(fn, ms) {
    const id = setTimeout(() => {
      arcTimers = arcTimers.filter((x) => x !== id);
      try { fn(); } catch (e) {}
    }, ms);
    arcTimers.push(id); return id;
  }
  function arcFrame(fn) {
    const id = requestAnimationFrame((t) => {
      arcRafs = arcRafs.filter((x) => x !== id);
      try { fn(t); } catch (e) {}
    });
    arcRafs.push(id); return id;
  }
  function arcEvery(fn, ms) { arcStopInterval(); arcInterval = setInterval(() => { try { fn(); } catch (e) {} }, ms); }
  function arcStopInterval() { if (arcInterval) { clearInterval(arcInterval); arcInterval = null; } }
  function arcCleanup() {
    arcTimers.forEach(clearTimeout); arcTimers = [];
    arcRafs.forEach(cancelAnimationFrame); arcRafs = [];
    arcStopInterval();
  }

  function arcSound(k) {
    try { play(k); } catch (e) {}
  }
  function arcVibe(p) { try { vibe(p); } catch (e) {} }
  function arcFxHost() { return $("#arcFx"); }
  function arcConfetti(n, colors) {
    const host = arcFxHost(); if (!host) return;
    const cs = colors || ["#ff4fa3", "#3fe8ff", "#ffcf5c", "#43e08a", "#a77bff", "#ffffff"];
    for (let i = 0; i < n; i++) {
      const d = document.createElement("i");
      d.className = "arc-conf";
      d.style.left = (2 + Math.random() * 96) + "%";
      d.style.background = cs[i % cs.length];
      d.style.animationDuration = (1.0 + Math.random() * 1.1) + "s";
      d.style.animationDelay = (Math.random() * .45) + "s";
      d.style.width = (6 + Math.random() * 7) + "px";
      d.style.height = (10 + Math.random() * 9) + "px";
      d.style.borderRadius = Math.random() < .3 ? "50%" : "2px";
      host.appendChild(d);
      arcLater(() => { try { d.remove(); } catch (e) {} }, 2600);
    }
  }
  function arcFlash() {
    const f = $("#arcFlash"); if (!f) return;
    f.classList.remove("go"); void f.offsetWidth; f.classList.add("go");
  }
  function arcFxLayer() {
    return `<div class="arc-fx" id="arcFx"><i class="arc-flash" id="arcFlash"></i></div>`;
  }
  function arcOut(id, html, kind) {
    const el = $(id); if (!el) return;
    el.className = "arc-out " + (kind || "");
    el.innerHTML = html;
    el.style.animation = "none"; void el.offsetWidth;
    el.style.animation = "arc-pop .34s cubic-bezier(.2,.8,.3,1.4)";
  }

  /* ---- persistence helpers (names kept for the rest of the module) ---- */
  function addTokens(n) { cfg.tokens = Math.max(0, num(cfg.tokens) + n); save(); }
  function best(key, val) {
    if (val > num(cfg.best[key])) { cfg.best[key] = val; save(); return true; }
    return false;
  }
  function arcStats() {
    if (!cfg.arcStats || typeof cfg.arcStats !== "object")
      cfg.arcStats = { wins: 0, losses: 0, jackpots: 0, bestStreak: 0, perfect: 0 };
    return cfg.arcStats;
  }
  function arcWin(n) { const s = arcStats(); s.wins += n || 1; save(); }
  function arcLoss(n) { const s = arcStats(); s.losses += n || 1; save(); }

  /* ---- shared chrome --------------------------------------------------- */
  function arcadeHead(title) {
    arcCSS();
    return `<div class="arc-root">
      ${arcFxLayer()}
      <div class="arc-hud">
        ${sp("token", "sm")}
        <div><div class="arc-lab">Tokens</div><b id="arcTokens">${num(cfg.tokens).toLocaleString("en-US")}</b></div>
        <div class="arc-right"><div class="arc-lab">${num(cfg.plays)} plays</div>
          <span class="arc-chip" id="arcBest">${esc(title || "Arcade")}</span></div>
      </div>`;
  }
  function arcFoot(id) {
    return `<div class="arc-back"><button class="arc-btn ghost sm" id="${id || "arcBack"}">Back to Arcade</button></div>
      </div>`;
  }
  function arcBindBack(id) {
    const b = $("#" + (id || "arcBack"));
    if (b) b.onclick = () => { arcCleanup(); play("choice"); openArcade(); };
  }
  function arcSyncTokens(animate, delta) {
    const el = $("#arcTokens"); if (!el) return;
    const target = num(cfg.tokens);
    if (!animate || typeof requestAnimationFrame !== "function") {
      el.textContent = target.toLocaleString("en-US"); return;
    }
    const from = num(el.textContent.replace(/[^0-9.-]/g, "")) || 0;
    const t0 = performance.now(), dur = 520;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (target - from) * e).toLocaleString("en-US");
      if (p < 1) arcFrame(step);
    };
    arcFrame(step);
    if (delta) {
      el.style.color = delta > 0 ? "#8bffb8" : "#ff9aa4";
      arcLater(() => { try { el.style.color = ""; } catch (e) {} }, 700);
    }
  }
  function arcScreen(title, body, back, backId) {
    showScreen(title, arcadeHead(title) + body + arcFoot(backId), back || openArcade);
    arcBindBack(backId);
    arcSyncTokens(false);
  }

  /* ---- HUB ------------------------------------------------------------- */
  function cashOut() {
    const L = life();
    if (L.cashYear === year()) { notify("Arcade", "You've already cashed out tokens this year. Age up and come back."); return; }
    if (num(cfg.tokens) < 10) { notify("Arcade", "You need at least 10 tokens to cash out."); return; }
    const amount = num(cfg.tokens) * 10;
    cfg.tokens = 0; L.cashYear = year(); save();
    money(amount);
    sayIt(`I cashed in my arcade tokens for ${fmt(amount)}.`);
    arcVibe([20, 40, 20]);
    arcSound("coins");
    notify("Cashed out!", `${fmt(amount)} was added to your bank balance. (10 tokens = $10, once per year)`);
    openArcade();
  }
  function openArcade() {
    arcCleanup();
    arcCSS();
    const s = arcStats();
    const games = ARC_GAMES.map((g) => `
      <div class="arc-game" data-mf-game="${g.k}" style="--gc:${g.c}">
        ${cv(g.k)}
        <span class="arc-tag" style="border-color:${g.c}66;color:${g.c}">${g.tag}</span>
        ${cfg.best[g.k] ? `<span class="arc-best">BEST ${esc(cfg.best[g.k])}</span>` : ""}
        <div class="arc-gInfo"><b>${esc(g.title)}</b><span>${esc(g.d)}</span></div>
      </div>`).join("");
    const rows = ARC_GAMES.map((g) =>
      `<tr><td>${esc(g.title)}</td><td>${cfg.best[g.k] ? esc(cfg.best[g.k]) : "—"}</td></tr>`).join("");
    showScreen("ARCADE", arcadeHead("ARCADE") + `
      <div class="arc-hero">
        <div class="arc-heroT"><b>ARCADE</b><span>Six games · one token economy</span></div>
        ${sp("trophy", "lg arc-heroFx")}
      </div>
      <div class="arc-sec">Games</div>
      <div class="arc-games">${games}</div>
      <div class="arc-sec">Tokens</div>
      <div class="arc-panel flat">
        <div class="arc-row" style="justify-content:space-between">
          <div><div class="arc-title">Cash out</div>
            <div class="arc-sub" style="margin:3px 0 0">10 tokens = $10 in your bank, once per game year.</div></div>
          <button class="arc-btn gold" data-mf-game="cash">CASH OUT</button>
        </div>
      </div>
      <div class="arc-sec">Records</div>
      <div class="arc-panel">
        <div class="arc-row tight">
          <span class="arc-chip">${num(cfg.plays)} plays</span>
          <span class="arc-chip">${num(s.wins)} wins</span>
          <span class="arc-chip">${num(s.jackpots)} jackpots</span>
          <span class="arc-chip">streak ${num(s.bestStreak)}</span>
        </div>
        <table class="arc-table"><thead><tr><th>Game</th><th>Best</th></tr></thead><tbody>${rows}</tbody></table>
      </div>
    </div>`, openSettingsScreen);
    $$("[data-mf-game]").forEach((el) => el.onclick = () => {
      play("choice"); const g = el.dataset.mfGame;
      ({ coin: gameCoin, higher: gameHigher, memory: gameMemory, slots: gameSlots,
         reaction: gameReaction, rps: gameRPS, cash: cashOut }[g] || openArcade)();
    });
    arcSyncTokens(false);
  }

  /* ================================================================== *
   * GAME 1 — COIN FLIP : stakes, streak multiplier, bank-or-bust
   * ================================================================== */
  function gameCoin() {
    arcCleanup();
    const L = life();
    const st = L.coin || (L.coin = { streak: 0, stake: 10, history: [], best: 0 });
    const stakes = [5, 10, 25, 50];
    const seg = stakes.map((v) => `<button class="arc-btn ${st.stake === v ? "on" : ""}" data-arc-stake="${v}">${v}</button>`).join("");
    const hist = st.history.slice(-8).map((h) => sp(h.res === "h" ? "coin-h" : "coin-t", "xs")).join("") || "";
    arcScreen("COIN FLIP", `
      <div class="arc-panel">
        <div class="arc-row" style="justify-content:space-between">
          <div class="arc-title">Call the toss</div><span class="arc-chip" id="arcMult">x1.0 payout</span>
        </div>
        <div class="arc-sub">Stake tokens, call heads or tails. Each correct call raises your multiplier —
          bank the streak before a loss wipes it.</div>
        <div class="arc-coinStage">
          <div class="arc-coinShadow" id="arcCoinShadow"></div>
          <div class="arc-coin3d" id="arcCoin">
            <i class="arc-face front"></i><i class="arc-face back"></i>
          </div>
        </div>
        <div class="arc-streak" id="arcStreak">${Array.from({length:6},(_,i)=>`<i class="${i<st.streak?"on":""}"></i>`).join("")}</div>
        <div class="arc-row" style="justify-content:center"><span class="arc-lab arc-chip">Stake</span>
          <span class="arc-seg">${seg}</span></div>
        <div class="arc-row" style="justify-content:center">
          <button class="arc-btn primary" data-mf-call="h">${sp("coin-h","xs")} HEADS</button>
          <button class="arc-btn" data-mf-call="t">${sp("coin-t","xs")} TAILS</button>
          <button class="arc-btn gold" id="arcBank">BANK STREAK</button>
        </div>
        <div class="arc-out" id="arcCoinOut"></div>
        <div class="arc-history" id="arcHistory">${hist}</div>
      </div>`, openArcade);

    const coin = $("#arcCoin"), shadow = $("#arcCoinShadow");
    const out = "#arcCoinOut";
    const mult = () => 1 + Math.min(st.streak, 8) * .5;
    const refresh = () => {
      const m = $("#arcMult"); if (m) m.textContent = "x" + mult().toFixed(1) + " payout";
      const sc = $("#arcStreak");
      if (sc) sc.innerHTML = Array.from({length:6},(_,i)=>`<i class="${i<Math.min(st.streak,6)?"on":""}"></i>`).join("");
      $$('[data-arc-stake]').forEach((b) => b.classList.toggle("on", +b.dataset.arcStake === st.stake));
      const bank = $("#arcBank"); if (bank) bank.disabled = st.streak < 1;
    };
    $$('[data-arc-stake]').forEach((b) => b.onclick = () => {
      st.stake = +b.dataset.arcStake; save(); arcSound("choice"); refresh();
    });
    const bank = $("#arcBank");
    if (bank) bank.onclick = () => {
      if (st.streak < 1) return;
      const bonus = st.streak * 12;
      addTokens(bonus); arcWin();
      arcOut(out, `Streak banked — <b>+${bonus} tokens</b>`, "good");
      arcConfetti(18); arcFlash(); arcSound("coins"); arcVibe([20,40,20]);
      st.streak = 0; save(); refresh(); arcSyncTokens(true, bonus);
    };
    $$('[data-mf-call]').forEach((b) => b.onclick = () => {
      // Synchronous bookkeeping so the game state is consistent immediately.
      cfg.plays++; save();
      if (num(cfg.tokens) < st.stake) {
        notify("Coin Flip", `You need ${st.stake} tokens for that stake. Lower it or win some in another game.`);
        arcOut(out, "Not enough tokens", "bad"); arcSound("buzzer"); return;
      }
      const call = b.dataset.mfCall;
      const res = Math.random() < .5 ? "h" : "t";
      const turns = 10 + (res === "t" ? 1 : 0) + rnd(0, 2) * 2;
      const mid = 180 * Math.floor(turns / 2);
      if (coin) {
        coin.style.setProperty("--arc-mid", mid + "deg");
        coin.style.setProperty("--arc-final", (turns * 180) + "deg");
        coin.classList.remove("spin"); void coin.offsetWidth; coin.classList.add("spin");
      }
      if (shadow) { shadow.style.animation = "none"; void shadow.offsetWidth; shadow.style.animation = ""; }
      $$('[data-mf-call]').forEach((x) => x.disabled = true);
      if (bank) bank.disabled = true;
      addTokens(-st.stake); arcSyncTokens(true, -st.stake);
      arcSound("pageFlip"); arcVibe(8);
      arcOut(out, "Flipping…", "info");

      arcLater(() => {
        const win = call === res;
        if (win) {
          st.streak++;
          const payout = Math.round(st.stake * mult());
          addTokens(st.stake + payout);
          best("coin", st.streak);
          const s = arcStats(); s.bestStreak = Math.max(num(s.bestStreak), st.streak); save();
          arcWin();
          arcOut(out, `${res === "h" ? "HEADS" : "TAILS"} — correct! <b>+${payout} tokens</b> · streak ${st.streak}`, "good");
          arcSound(st.streak >= 3 ? "casinoWin" : "coins");
          arcVibe(st.streak >= 3 ? [20,40,20,40] : 12);
          if (st.streak >= 3) { arcConfetti(10 + st.streak * 3); arcFlash(); }
          arcSyncTokens(true, st.stake + payout);
        } else {
          st.streak = 0; arcLoss();
          arcOut(out, `${res === "h" ? "HEADS" : "TAILS"} — wrong. Stake lost, streak reset.`, "bad");
          arcSound("buzzer"); arcVibe([25,30]);
        }
        st.history.push({ res, win }); if (st.history.length > 8) st.history.shift();
        const h = $("#arcHistory");
        if (h) h.innerHTML = st.history.map((x) => sp(x.res === "h" ? "coin-h" : "coin-t", "xs")).join("");
        save(); refresh();
        $$('[data-mf-call]').forEach((x) => x.disabled = false);
        if (bank) bank.disabled = st.streak < 1;
        render();
      }, 1200);
    });
    refresh();
    arcOut(out, st.streak ? `Streak ${st.streak} live — bank it or risk it.` : "Pick a stake and call the toss.", "info");
  }

  /* ================================================================== *
   * GAME 2 — HIGHER OR LOWER : real 52-card deck, odds, pot, one swap
   * ================================================================== */
  function arcNewDeck() {
    const d = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) d.push({ r, s });
    for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
    return d;
  }
  function arcCardHTML(c) {
    const rank = ARC_RANKS[c.r] || c.r;
    return `<div class="arc-rank" style="color:${c.s === 0 || c.s === 1 ? "#d02a4e" : "#171c3a"}">${rank}</div>
      ${sp(ARC_SUITS[c.s])}`;
  }
  function gameHigher() {
    arcCleanup();
    const L = life();
    if (!L.hl || !L.hl.deck || !L.hl.deck.length) L.hl = { deck: arcNewDeck(), cur: null, streak: 0, pot: 0, swap: 1, over: false };
    const st = L.hl;
    if (!st.cur && st.deck.length) st.cur = st.deck.pop();
    arcScreen("HIGHER OR LOWER", `
      <div class="arc-panel">
        <div class="arc-row" style="justify-content:space-between">
          <div class="arc-title">Read the deck</div><span class="arc-chip" id="arcHlPot">POT 0</span>
        </div>
        <div class="arc-sub">A real 52-card deck, no replacement. Equal rank is a push — your streak survives.
          Bank the pot any time, or use your one swap to escape a bad card.</div>
        <div class="arc-cardStage">
          <div class="arc-card" id="arcHlCard"><div class="arc-f"></div><div class="arc-b" id="arcHlFace"></div></div>
          <div style="text-align:center">
            <div class="arc-chip" id="arcHlStreak">STREAK 0</div>
            <div class="arc-sub" style="margin-top:8px">Cards left</div>
            <div class="arc-bigNum" style="font-size:22px" id="arcHlLeft">0</div>
          </div>
        </div>
        <div class="arc-prob" id="arcHlProb"></div>
        <div class="arc-row" style="justify-content:center">
          <button class="arc-btn primary" id="arcHlUp">HIGHER</button>
          <button class="arc-btn primary" id="arcHlDown">LOWER</button>
          <button class="arc-btn" id="arcHlSwap">SWAP (1)</button>
          <button class="arc-btn gold" id="arcHlBank">BANK POT</button>
        </div>
        <div class="arc-out" id="arcHlOut"></div>
      </div>`, openArcade);

    const card = $("#arcHlCard"), face = $("#arcHlFace");
    const reveal = (c, cb) => {
      if (!card) return;
      face.innerHTML = arcCardHTML(c);
      card.classList.add("deal"); card.classList.toggle("flip", true);
      arcSound("pageFlip");
      arcLater(() => { card.classList.remove("deal"); if (cb) cb(); }, 480);
    };
    const odds = () => {
      if (!st.cur) return;
      let up = 0, down = 0, eq = 0;
      for (const c of st.deck) { if (c.r > st.cur.r) up++; else if (c.r < st.cur.r) down++; else eq++; }
      const tot = Math.max(1, st.deck.length);
      const p = $("#arcHlProb");
      if (p) p.innerHTML = `
        <div><b>${Math.round(up/tot*100)}%</b><span>Higher</span></div>
        <div><b>${Math.round(eq/tot*100)}%</b><span>Push</span></div>
        <div><b>${Math.round(down/tot*100)}%</b><span>Lower</span></div>`;
      const left = $("#arcHlLeft"); if (left) left.textContent = st.deck.length;
    };
    const refresh = () => {
      const pot = $("#arcHlPot"); if (pot) pot.textContent = "POT " + st.pot;
      const sr = $("#arcHlStreak"); if (sr) sr.textContent = "STREAK " + st.streak;
      const sw = $("#arcHlSwap"); if (sw) { sw.disabled = st.swap < 1 || st.over; sw.textContent = `SWAP (${st.swap})`; }
      const bk = $("#arcHlBank"); if (bk) bk.disabled = st.pot < 1 || st.over;
      const left = $("#arcHlLeft"); if (left) left.textContent = st.deck.length;
      odds();
    };
    const setButtons = (on) => {
      ["arcHlUp","arcHlDown"].forEach((id) => { const b = $("#"+id); if (b) b.disabled = !on || st.over; });
      const sw = $("#arcHlSwap"); if (sw) sw.disabled = !on || st.swap < 1 || st.over;
      const bk = $("#arcHlBank"); if (bk) bk.disabled = !on || st.pot < 1 || st.over;
    };
    const bank = (silent) => {
      if (st.pot < 1) return;
      addTokens(st.pot); best("higher", st.streak); arcWin();
      if (!silent) {
        arcOut("#arcHlOut", `Banked <b>${st.pot} tokens</b> on a ${st.streak}-card streak.`, "good");
        arcConfetti(20); arcFlash(); arcSound("coins"); arcVibe([20,40,20]);
      }
      arcSyncTokens(true, st.pot);
      const won = st.pot; st.pot = 0; st.streak = 0;
      st.deck = arcNewDeck(); st.cur = st.deck.pop(); st.swap = 1; st.over = false;
      save(); refresh(); setButtons(true); render();
      return won;
    };
    const draw = () => {
      if (!st.deck.length) { bank(true); arcOut("#arcHlOut", "Deck exhausted — pot banked automatically.", "info"); return null; }
      return st.deck.pop();
    };
    const guess = (dir) => {
      if (st.over) return;
      const next = draw(); if (!next) return;
      setButtons(false);
      reveal(next, () => {
        cfg.plays++; save();
        const eq = next.r === st.cur.r;
        const correct = dir === "up" ? next.r > st.cur.r : next.r < st.cur.r;
        if (eq) {
          arcOut("#arcHlOut", `${ARC_RANKS[next.r]||next.r} — <b>push</b>. Streak survives, no pot added.`, "info");
          arcSound("reveal");
        } else if (correct) {
          st.streak++; st.pot += 8 + st.streak * 4;
          best("higher", st.streak);
          const s = arcStats(); s.bestStreak = Math.max(num(s.bestStreak), st.streak);
          arcOut("#arcHlOut", `${ARC_RANKS[next.r]||next.r} — <b>correct!</b> +${8 + st.streak*4} to the pot · streak ${st.streak}`, "good");
          arcSound("ding"); arcVibe(10);
          if (st.streak % 5 === 0) { arcConfetti(22); arcFlash(); arcSound("casinoWin"); }
        } else {
          arcOut("#arcHlOut", `${ARC_RANKS[next.r]||next.r} — <b>wrong.</b> ${st.pot} tokens lost. New run ready.`, "bad");
          st.pot = 0; st.streak = 0; st.over = true; arcLoss();
          arcSound("buzzer"); arcVibe([25,30]);
        }
        st.cur = next; save(); refresh();
        if (st.over) {
          arcLater(() => {
            st.deck = arcNewDeck(); st.cur = st.deck.pop(); st.swap = 1; st.over = false;
            save(); refresh(); setButtons(true);
            arcOut("#arcHlOut", "Fresh deck dealt — go again.", "info");
          }, 900);
        } else setButtons(true);
        render();
      });
    };
    const up = $("#arcHlUp"); if (up) up.onclick = () => guess("up");
    const dn = $("#arcHlDown"); if (dn) dn.onclick = () => guess("down");
    const swp = $("#arcHlSwap"); if (swp) swp.onclick = () => {
      if (st.swap < 1 || st.over) return;
      st.swap--; const n = draw(); if (!n) return;
      setButtons(false); reveal(n, () => {
        st.cur = n; save(); refresh(); setButtons(true);
        arcOut("#arcHlOut", "Card swapped. Streak and pot are safe.", "info");
        arcSound("pageFlip");
      });
    };
    const bk = $("#arcHlBank"); if (bk) bk.onclick = () => bank(false);
    reveal(st.cur);
    refresh();
    arcOut("#arcHlOut", "Higher or lower? The odds are live.", "info");
  }

  /* ================================================================== *
   * GAME 3 — MEMORY MATCH : study phase, 3D flips, combos, timer, hint
   * ================================================================== */
  function gameMemory() {
    arcCleanup();
    const L = life();
    const cards = ARC_MEM.concat(ARC_MEM).sort(() => Math.random() - .5);
    const m = L.mem = { cards, flipped: [], matched: [], moves: 0, combo: 0, best: 0,
                        t0: 0, lock: true, done: false, hint: false, study: true };
    const tiles = cards.map((c, i) => `
      <div class="arc-mem" data-arc-mem="${i}">
        <div class="arc-in"><div class="arc-mf">${sp("cardback","")}</div>
          <div class="arc-mb">${sp(c,"")}</div></div>
      </div>`).join("");
    arcScreen("MEMORY MATCH", `
      <div class="arc-panel">
        <div class="arc-row" style="justify-content:space-between">
          <div class="arc-title">Find all 8 pairs</div><span class="arc-chip" id="arcMemTime">00:00</span>
        </div>
        <div class="arc-sub">Study the board, then flip two at a time. Combos, speed and a low move count
          all raise your score. A hint costs 15 tokens.</div>
        <div class="arc-row tight">
          <span class="arc-chip">Moves <b id="arcMemMoves">0</b></span>
          <span class="arc-chip" id="arcMemCombo">Combo x1</span>
          <span class="arc-chip" id="arcMemPairs">0 / 8 pairs</span>
        </div>
        <div class="arc-bar green" id="arcMemStudyBar"><u style="width:100%"></u></div>
        <div class="arc-memGrid" id="arcMemGrid">${tiles}</div>
        <div class="arc-row" style="justify-content:center">
          <button class="arc-btn" id="arcMemHint">HINT · 15</button>
          <button class="arc-btn ghost" id="arcMemNew">NEW BOARD</button>
        </div>
        <div class="arc-out" id="arcMemOut"></div>
      </div>`, openArcade);

    const grid = $("#arcMemGrid");
    const bar = $("#arcMemStudyBar u");
    const upd = () => {
      const mv = $("#arcMemMoves"); if (mv) mv.textContent = m.moves;
      const cb = $("#arcMemCombo"); if (cb) cb.textContent = "Combo x" + (1 + Math.min(m.combo, 5));
      const pr = $("#arcMemPairs"); if (pr) pr.textContent = (m.matched.length/2) + " / 8 pairs";
    };
    const tick = () => {
      const t = $("#arcMemTime"); if (!t) return;
      const sec = Math.floor((performance.now() - m.t0) / 1000);
      t.textContent = String(Math.floor(sec/60)).padStart(2,"0") + ":" + String(sec%60).padStart(2,"0");
    };
    const finishGame = () => {
      m.done = true; arcCleanup();
      const sec = Math.floor((performance.now() - m.t0)/1000);
      const stars = m.moves <= 10 ? 3 : m.moves <= 15 ? 2 : 1;
      const score = Math.max(0, 200 - m.moves * 6 - sec) + stars * 25;
      const reward = Math.max(8, Math.round(score / 3));
      addTokens(reward); best("memory", score); arcWin(); cfg.plays++; save();
      const s = arcStats(); if (m.moves <= 8) s.perfect++; save();
      const starsHTML = Array.from({length:3},(_,i) => sp("burst","xs",i < stars ? "" : "opacity:.28;filter:grayscale(1)")).join("");
      arcOut("#arcMemOut", `<b>All pairs!</b> ${m.moves} moves · ${sec}s · ${starsHTML} <b>+${reward} tokens</b>`, "good");
      arcConfetti(60); arcFlash(); arcSound("achievement"); arcVibe([20,40,20,40]);
      arcSyncTokens(true, reward);
      const b = $("#arcMemHint"); if (b) b.disabled = true;
      render();
    };
    const flip = (i) => {
      if (m.lock || m.done || m.study || m.flipped.includes(i) || m.matched.includes(i)) return;
      const el = grid && grid.querySelector(`[data-arc-mem="${i}"]`);
      if (!el) return;
      el.classList.add("flip"); m.flipped.push(i); arcSound("pageFlip");
      if (m.flipped.length < 2) return;
      m.moves++; m.lock = true; upd();
      const [a, b] = m.flipped;
      if (m.cards[a] === m.cards[b]) {
        m.matched.push(a, b); m.flipped = []; m.combo++;
        arcLater(() => {
          [a, b].forEach((j) => { const e = grid.querySelector(`[data-arc-mem="${j}"]`); if (e) e.classList.add("done"); });
          arcSound("ding"); arcVibe(8); arcConfetti(6);
          upd(); m.lock = false;
          if (m.matched.length === m.cards.length) finishGame();
        }, 300);
      } else {
        m.combo = 0;
        [a, b].forEach((j) => { const e = grid.querySelector(`[data-arc-mem="${j}"]`); if (e) e.classList.add("wrong"); });
        arcSound("buzzer");
        arcLater(() => {
          [a, b].forEach((j) => {
            const e = grid.querySelector(`[data-arc-mem="${j}"]`);
            if (e) e.classList.remove("flip", "wrong");
          });
          m.flipped = []; m.lock = false; upd();
        }, 760);
      }
    };
    if (grid) $$('[data-arc-mem]', grid).forEach((el) => el.onclick = () => flip(+el.dataset.arcMem));
    const hint = $("#arcMemHint");
    if (hint) hint.onclick = () => {
      if (m.study || m.done || m.lock) return;
      if (num(cfg.tokens) < 15) { notify("Memory Match", "A hint costs 15 tokens."); arcSound("buzzer"); return; }
      addTokens(-15); arcSyncTokens(true, -15);
      const pool = m.cards.map((c,i) => i).filter((i) => !m.matched.includes(i) && !m.flipped.includes(i));
      const show = pool.slice().sort(() => Math.random() - .5).slice(0, 2);
      show.forEach((i) => { const e = grid.querySelector(`[data-arc-mem="${i}"]`); if (e) e.classList.add("hint"); });
      arcOut("#arcMemOut", "Two tiles revealed for a moment…", "info");
      arcSound("reveal");
      arcLater(() => {
        show.forEach((i) => { const e = grid.querySelector(`[data-arc-mem="${i}"]`); if (e) e.classList.remove("hint"); });
      }, 1100);
    };
    const nb = $("#arcMemNew"); if (nb) nb.onclick = () => { play("choice"); gameMemory(); };

    // Study phase: reveal everything, count down 3s, then flip back and start.
    if (grid) $$('[data-arc-mem]', grid).forEach((el) => el.classList.add("flip"));
    arcOut("#arcMemOut", "STUDY THE BOARD…", "info");
    const t0 = performance.now(), dur = 2600;
    const studyStep = (t) => {
      const p = Math.min(1, (t - t0)/dur);
      if (bar) bar.style.width = (100 - p*100).toFixed(1) + "%";
      if (p < 1) arcFrame(studyStep);
      else {
        if (grid) $$('[data-arc-mem]', grid).forEach((el) => el.classList.remove("flip"));
        m.study = false; m.lock = false; m.t0 = performance.now();
        arcEvery(tick, 250); tick();
        arcOut("#arcMemOut", "Go! Find the pairs.", "");
        arcSound("reveal");
      }
    };
    arcFrame(studyStep);
    upd();
  }

  /* ================================================================== *
   * GAME 4 — LUCKY SLOTS : staggered reel spin, weighted RNG, paytable
   * ================================================================== */
  function arcWeighted() {
    const total = ARC_SLOT.reduce((a, s) => a + s.w, 0);
    let r = Math.random() * total;
    for (const s of ARC_SLOT) { r -= s.w; if (r <= 0) return s; }
    return ARC_SLOT[0];
  }
  function gameSlots() {
    arcCleanup();
    const L = life();
    const st = L.slots || (L.slots = { bet: 5, auto: false, free: 0, spins: 0 });
    const pay = ARC_SLOT.slice(0, 6).map((s) =>
      `<div>${sp(s.k)}<span>${s.pay === 500 ? "500" : s.pay === 300 ? "300" : "100"}</span></div>`).join("");
    arcScreen("LUCKY SLOTS", `
      <div class="arc-panel">
        <div class="arc-row" style="justify-content:space-between">
          <div class="arc-title">Three-reel jackpot</div><span class="arc-chip" id="arcSlotFree">NO FREE SPINS</span>
        </div>
        <div class="arc-sub">Weighted reels, real near-misses and a full paytable. Three 7s award five free spins.
          Payouts scale with your bet.</div>
        <div class="arc-machine">
          <div class="arc-lights">${Array.from({length:9},(_,i)=>`<i style="animation-delay:${i*.11}s"></i>`).join("")}</div>
          <div class="arc-reels" id="arcReels">
            ${[0,1,2].map((i) => `<div class="arc-reel" data-arc-reel="${i}">
              <div class="arc-strip" id="arcStrip${i}"></div></div>`).join("")}
          </div>
        </div>
        <div class="arc-row" style="justify-content:center;margin-top:12px">
          <span class="arc-lab arc-chip">Bet</span>
          <span class="arc-seg">${[1,5,10,25].map((v) =>
            `<button class="arc-btn ${st.bet === v ? "on" : ""}" data-arc-bet="${v}">${v}</button>`).join("")}</span>
        </div>
        <div class="arc-row" style="justify-content:center">
          <button class="arc-btn gold" id="arcSpin">SPIN · <span id="arcSpinCost">5</span></button>
          <button class="arc-btn ${st.auto ? "primary" : "ghost"}" id="arcAuto">AUTO</button>
        </div>
        <div class="arc-pay">${pay}</div>
        <div class="arc-out" id="arcSlotOut"></div>
      </div>`, openArcade);

    const CELL_H = 88, STRIP_N = 14;
    const fillStrip = (i, result) => {
      const strip = $("#arcStrip" + i); if (!strip) return;
      const seq = [];
      for (let j = 0; j < STRIP_N - 1; j++) seq.push(arcWeighted());
      seq.push(result);
      strip.innerHTML = seq.map((s) => `<div class="arc-cell">${sp(s.k)}</div>`).join("");
      strip.style.transform = "translateY(0px)";
      return strip;
    };
    [0,1,2].forEach((i) => fillStrip(i, ARC_SLOT[0]));
    const spinState = { busy: false, raf: [] };
    const stopReel = (i, result, dur, done) => {
      const strip = fillStrip(i, result); if (!strip) { done(); return; }
      const target = -(STRIP_N - 1) * CELL_H;
      const t0 = performance.now();
      const ease = (p) => 1 - Math.pow(1 - p, 3);
      const step = (t) => {
        const p = Math.min(1, (t - t0) / dur);
        strip.style.transform = `translateY(${(target * ease(p)).toFixed(2)}px)`;
        if (p < 1) arcFrame(step);
        else { strip.style.transform = `translateY(${target}px)`; done(); }
      };
      arcFrame(step);
    };
    const refreshBet = () => {
      $$('[data-arc-bet]').forEach((b) => b.classList.toggle("on", +b.dataset.arcBet === st.bet));
      const c = $("#arcSpinCost"); if (c) c.textContent = st.free > 0 ? "FREE" : st.bet;
      const f = $("#arcSlotFree"); if (f) f.textContent = st.free > 0 ? `${st.free} FREE SPINS` : "NO FREE SPINS";
      const a = $("#arcAuto"); if (a) a.classList.toggle("primary", !!st.auto); a && a.classList.toggle("ghost", !st.auto);
    };
    const evaluate = (r) => {
      const [a,b,c] = r.map((x) => x.k);
      const mult = Math.max(1, st.bet / 5);
      let win = 0, label = "";
      if (a === b && b === c) {
        const s = ARC_SLOT.find((x) => x.k === a);
        win = Math.round((s ? s.pay : 100) * mult);
        label = `THREE ${(s ? s.name : a).toUpperCase()}!`;
        if (a === "seven") { st.free += 5; }
        const st2 = arcStats(); st2.jackpots++; save();
      } else if (a === b || b === c || a === c) {
        win = Math.round(20 * mult); label = "TWO OF A KIND";
      }
      return { win, label };
    };
    const spin = () => {
      if (spinState.busy) return;
      const free = st.free > 0;
      const cost = free ? 0 : st.bet;
      if (num(cfg.tokens) < cost) {
        notify("Lucky Slots", `You need ${cost} tokens to spin. Try another game first.`);
        arcSound("buzzer"); st.auto = false; save(); refreshBet(); return;
      }
      spinState.busy = true;
      const btn = $("#arcSpin"); if (btn) btn.disabled = true;
      if (cost) addTokens(-cost);
      if (free) st.free--;
      st.spins++; cfg.plays++; save();
      arcSyncTokens(true, cost ? -cost : 0);
      arcSound("atm"); arcVibe(8);
      arcOut("#arcSlotOut", "Reels spinning…", "info");
      $$('[data-arc-reel]').forEach((el) => el.classList.remove("win"));

      // Weighted results with deliberate near-misses.
      let r = [arcWeighted(), arcWeighted(), arcWeighted()];
      if (Math.random() < .14 && r[0].k !== r[1].k) { r[1] = r[0]; r[2] = arcWeighted(); if (r[2].k === r[0].k) r[2] = ARC_SLOT[1]; }
      let stopped = 0;
      [0,1,2].forEach((i) => {
        stopReel(i, r[i], 900 + i * 420, () => {
          arcSound("ding");
          const reel = $(`[data-arc-reel="${i}"]`); if (reel) reel.classList.add("win");
          stopped++;
          if (stopped < 3) return;
          const { win, label } = evaluate(r);
          if (win) {
            addTokens(win); best("slots", win); arcWin();
            arcOut("#arcSlotOut", `<b>${label}</b> +${win} tokens!`, "good");
            arcSound(win >= 200 ? "casinoWin" : "coins");
            arcVibe([20,40,20]);
            arcConfetti(win >= 200 ? 60 : 22); arcFlash();
            arcSyncTokens(true, win);
          } else {
            arcLoss();
            arcOut("#arcSlotOut", "No win this time. Spin again?", "bad");
            arcSound("buzzer");
          }
          spinState.busy = false;
          if (btn) btn.disabled = false;
          refreshBet(); save(); render();
          if (st.auto && (num(cfg.tokens) >= st.bet || st.free > 0)) arcLater(spin, 700);
          else if (st.auto) { st.auto = false; save(); refreshBet(); }
        });
      });
      refreshBet();
    };
    const sb = $("#arcSpin"); if (sb) sb.onclick = spin;
    $$('[data-arc-bet]').forEach((b) => b.onclick = () => { st.bet = +b.dataset.arcBet; save(); refreshBet(); arcSound("choice"); });
    const ab = $("#arcAuto"); if (ab) ab.onclick = () => { st.auto = !st.auto; save(); refreshBet(); arcSound("choice"); if (st.auto) spin(); };
    refreshBet();
    arcOut("#arcSlotOut", "Set your bet and hit SPIN.", "info");
  }

  /* ================================================================== *
   * GAME 5 — REACTION TEST : 5 rounds, false starts, consistency score
   * ================================================================== */
  function arcRank(ms) {
    if (ms < 180) return "LIGHTNING";
    if (ms < 250) return "ELITE";
    if (ms < 330) return "SHARP";
    if (ms < 450) return "STEADY";
    if (ms < 650) return "WARMING UP";
    return "SLOW";
  }
  function gameReaction() {
    arcCleanup();
    const L = life();
    const st = L.react || (L.react = { round: 0, times: [], falseStarts: 0, phase: "idle", t0: 0, session: 0 });
    // Entering from the hub always starts a clean five-round run — never
    // silently resume an abandoned session with old times in the table.
    if (st.phase !== "go" && st.phase !== "wait") {
      st.round = 0; st.times = []; st.falseStarts = 0; st.phase = "idle";
      st.session = num(st.session) + 1; save();
    }
    arcScreen("REACTION TEST", `
      <div class="arc-panel">
        <div class="arc-row" style="justify-content:space-between">
          <div class="arc-title">Five-round reflex run</div><span class="arc-chip" id="arcReactRound">ROUND 1 / 5</span>
        </div>
        <div class="arc-sub">Tap to arm, wait for the lights to turn green, then tap instantly.
          A false start costs you the round. Consistency counts as much as raw speed.</div>
        <div class="arc-lights3" id="arcLights"><i></i><i></i><i></i></div>
        <div class="arc-pad idle" id="arcReactPad">
          <i class="arc-padRing"></i>
          <div class="arc-padMsg" id="arcReactMsg"><b>TAP TO ARM</b><span>Round 1 of 5</span></div>
        </div>
        <div class="arc-bigNum" id="arcReactBig">—</div>
        <div class="arc-bar"><u id="arcReactBar" style="width:0%"></u></div>
        <div class="arc-row tight" style="justify-content:center">
          <span class="arc-chip" id="arcReactAvg">AVG —</span>
          <span class="arc-chip" id="arcReactBest">BEST —</span>
          <span class="arc-chip" id="arcReactFs">FALSE STARTS 0</span>
        </div>
        <table class="arc-table"><thead><tr><th>Round</th><th>Time / verdict</th></tr></thead>
          <tbody id="arcReactRows"></tbody></table>
        <div class="arc-row" style="justify-content:center"><button class="arc-btn ghost sm" id="arcReactReset">NEW SESSION</button></div>
        <div class="arc-out" id="arcReactOut"></div>
      </div>`, openArcade);

    const pad = $("#arcReactPad"), msg = $("#arcReactMsg"), big = $("#arcReactBig");
    const lights = $$("#arcLights i");
    const setLights = (n) => lights.forEach((l, i) => { l.className = i < n ? (n === 3 ? "g" : i === 2 ? "a" : "r") : ""; });
    const setState = (cls, title, sub) => {
      if (pad) pad.className = "arc-pad " + cls;
      if (msg) msg.innerHTML = `<b>${title}</b><span>${sub}</span>`;
    };
    const upd = () => {
      const rr = $("#arcReactRound"); if (rr) rr.textContent = `ROUND ${Math.min(st.round+1,5)} / 5`;
      const fs = $("#arcReactFs"); if (fs) fs.textContent = `FALSE STARTS ${st.falseStarts}`;
      const times = st.times.filter((x) => x > 0);
      const avg = times.length ? Math.round(times.reduce((a,b)=>a+b,0)/times.length) : 0;
      const a = $("#arcReactAvg"); if (a) a.textContent = "AVG " + (avg ? avg + " ms" : "—");
      const b = $("#arcReactBest"); if (b) b.textContent = "BEST " + (times.length ? Math.min(...times) + " ms" : "—");
      const bar = $("#arcReactBar"); if (bar) bar.style.width = (st.times.length/5*100) + "%";
      const rows = $("#arcReactRows");
      if (rows) rows.innerHTML = st.times.map((ms, i) =>
        `<tr><td>${i+1}</td><td>${ms < 0 ? '<span style="color:#ff9aa4">FALSE START</span>' :
          `<b>${ms} ms</b> · ${arcRank(ms)}`}</td></tr>`).join("");
    };
    const finish = () => {
      const times = st.times.filter((x) => x > 0);
      const avg = times.length ? times.reduce((a,b)=>a+b,0)/times.length : 0;
      const mean = avg || 1;
      const variance = times.length ? times.reduce((a,b)=>a+(b-mean)*(b-mean),0)/times.length : 0;
      const consistency = Math.round(Math.max(0, 100 - Math.sqrt(variance)/2));
      const score = Math.max(0, Math.round(1000 - avg + consistency - st.falseStarts*60));
      const reward = Math.max(5, Math.round(score/12));
      addTokens(reward); best("reaction", score); arcWin();
      arcOut("#arcReactOut", `<b>SESSION COMPLETE</b> — ${Math.round(avg)} ms avg · consistency ${consistency} · <b>+${reward} tokens</b>`, "good");
      arcConfetti(50); arcFlash(); arcSound("achievement"); arcVibe([20,40,20]);
      arcSyncTokens(true, reward);
      setState("idle", "RUN COMPLETE", "Tap NEW SESSION to go again");
      setLights(0); big.textContent = score + " pts";
      st.phase = "done"; st.round = 5; save(); upd(); render();
    };
    const arm = () => {
      if (st.phase !== "idle" && st.phase !== "done") return;
      if (st.phase === "done") { st.round = 0; st.times = []; st.falseStarts = 0; save(); upd(); }
      st.phase = "wait"; setLights(1);
      setState("wait", "WAIT…", "Don't tap until it turns green");
      big.textContent = "—";
      arcOut("#arcReactOut", "Stay sharp…", "info");
      arcTimers.forEach(clearTimeout); arcTimers = [];
      arcLater(() => {
        if (st.phase !== "wait") return;
        st.phase = "go"; st.t0 = performance.now();
        setLights(3);
        setState("go", "TAP!", "Now");
        arcSound("ding"); arcVibe(8);
        arcFlash();
      }, rnd(1200, 3400));
    };
    const tap = () => {
      if (st.phase === "done") { arm(); return; }
      if (st.phase === "idle") { arm(); return; }
      if (st.phase === "wait") {
        // False start.
        arcCleanup();
        st.times.push(-1); st.falseStarts++; st.round++; st.phase = "idle";
        cfg.plays++; save();
        setState("bad", "TOO EARLY", "False start — round lost");
        setLights(1); big.textContent = "×";
        arcOut("#arcReactOut", "False start! Wait for the green light.", "bad");
        arcSound("buzzer"); arcVibe([25,30]);
        upd();
        if (st.round >= 5) arcLater(finish, 600);
        return;
      }
      if (st.phase === "go") {
        const ms = Math.round(performance.now() - st.t0);
        arcCleanup();
        st.times.push(ms); st.round++; st.phase = "idle";
        cfg.plays++; save();
        setState("idle", ms + " ms", arcRank(ms));
        setLights(0); big.textContent = ms + " ms";
        arcOut("#arcReactOut", `<b>${ms} ms</b> — ${arcRank(ms)}`, ms < 330 ? "good" : "info");
        arcSound(ms < 250 ? "casinoWin" : "ding"); arcVibe(10);
        if (ms < 220) arcConfetti(14);
        upd();
        if (st.round >= 5) arcLater(finish, 650);
        else arcLater(() => { if (st.phase === "idle") { setState("idle", "TAP TO ARM", `Round ${st.round+1} of 5`); } }, 1100);
      }
    };
    if (pad) pad.onclick = tap;
    const rs = $("#arcReactReset");
    if (rs) rs.onclick = () => {
      arcCleanup(); st.round = 0; st.times = []; st.falseStarts = 0; st.phase = "idle"; st.session++;
      save(); upd(); setLights(0); big.textContent = "—";
      setState("idle", "TAP TO ARM", "Round 1 of 5");
      arcOut("#arcReactOut", "New session ready.", "info");
      play("choice");
    };
    upd();
    setLights(0);
    setState("idle", "TAP TO ARM", `Round ${st.round+1} of 5`);
    arcOut("#arcReactOut", "Tap the pad to arm the first round.", "info");
  }

  /* ================================================================== *
   * GAME 6 — ROCK PAPER SCISSORS : adaptive AI, animated throws, best of 5
   * ================================================================== */
  function gameRPS() {
    arcCleanup();
    const L = life();
    const st = L.rps || (L.rps = { me: 0, cpu: 0, history: [], freq: { r:0, p:0, s:0 }, match: 0 });
    const opts = [["r","rock","ROCK"],["p","paper","PAPER"],["s","scissors","SCISSORS"]];
    arcScreen("ROCK PAPER SCISSORS", `
      <div class="arc-panel">
        <div class="arc-row" style="justify-content:space-between">
          <div class="arc-title">Best of five</div><span class="arc-chip" id="arcRpsMatch">MATCH ${st.match+1}</span>
        </div>
        <div class="arc-sub">The opponent tracks what you throw and starts countering it. Mix it up.
          Win the match for 40 tokens plus a streak bonus.</div>
        <div class="arc-arena">
          <div class="arc-hand" id="arcRpsMe">${sp("rock","lg")}</div>
          <div class="arc-vs">${sp("versus","")}<b id="arcRpsCall">READY</b></div>
          <div class="arc-hand cpu" id="arcRpsCpu">${sp("rock","lg")}</div>
        </div>
        <div class="arc-score">
          <div><span>YOU</span><div class="arc-pips" id="arcRpsPipsMe"></div></div>
          <div><span>CPU</span><div class="arc-pips" id="arcRpsPipsCpu"></div></div>
        </div>
        <div class="arc-row" style="justify-content:center">
          ${opts.map(([k,art,lab]) => `<button class="arc-btn" data-mf-rps="${k}">${sp(art,"sm")} ${lab}</button>`).join("")}
        </div>
        <div class="arc-hist" id="arcRpsHist"></div>
        <div class="arc-row" style="justify-content:center">
          <button class="arc-btn ghost sm" id="mfRpsReset">New match</button>
        </div>
        <div class="arc-out" id="arcRpsOut"></div>
      </div>`, openArcade, "mfRpsBack");

    const beats = { r:"s", p:"r", s:"p" };
    const label = { r:"ROCK", p:"PAPER", s:"SCISSORS" };
    const meEl = $("#arcRpsMe"), cpuEl = $("#arcRpsCpu"), call = $("#arcRpsCall");
    const pips = (id, n) => { const e = $(id); if (e) e.innerHTML = Array.from({length:3},(_,i)=>`<i class="arc-pip ${i<n?"on":""}"></i>`).join(""); };
    const hist = () => {
      const h = $("#arcRpsHist");
      if (h) h.innerHTML = st.history.slice(-10).map((x) => sp(x === "w" ? "win" : x === "l" ? "lose" : "draw", "xs")).join("");
    };
    const aiPick = () => {
      // Counter the player's most-used throw 60% of the time, else random.
      const total = st.freq.r + st.freq.p + st.freq.s;
      if (total >= 2 && Math.random() < .6) {
        const fav = Object.keys(st.freq).sort((a,b) => st.freq[b] - st.freq[a])[0];
        return Object.keys(beats).find((k) => beats[k] === fav) || fav;
      }
      return pick(["r","p","s"]);
    };
    const refresh = () => {
      pips("#arcRpsPipsMe", st.me); pips("#arcRpsPipsCpu", st.cpu); hist();
      const m = $("#arcRpsMatch"); if (m) m.textContent = "MATCH " + (st.match + 1);
    };
    const setButtons = (on) => $$('[data-mf-rps]').forEach((b) => b.disabled = !on);
    const reset = () => { st.me = 0; st.cpu = 0; st.history = []; save(); refresh(); };

    $$('[data-mf-rps]').forEach((b) => b.onclick = () => {
      if (st.me >= 3 || st.cpu >= 3) return;
      const me = b.dataset.mfRps;
      const cpu = aiPick();
      cfg.plays++; st.freq[me]++; save();
      setButtons(false);
      if (meEl) { meEl.classList.add("shake"); meEl.querySelector(".arc-sp").style.backgroundPosition = arcPos(me); }
      if (cpuEl) cpuEl.classList.add("shake");
      if (call) call.textContent = "ROCK…";
      arcSound("choice"); arcVibe(8);
      arcOut("#arcRpsOut", "Rock… paper… scissors…", "info");

      const words = ["ROCK…", "PAPER…", "SCISSORS…"];
      words.forEach((w, i) => arcLater(() => { if (call) call.textContent = w; arcSound("choice"); }, 180 + i*220));
      arcLater(() => {
        if (call) call.textContent = "SHOOT!";
        [meEl, cpuEl].forEach((e) => { if (e) { e.classList.remove("shake"); e.classList.add("reveal"); } });
        if (cpuEl) cpuEl.querySelector(".arc-sp").style.backgroundPosition = arcPos(cpu);
        if (meEl) meEl.querySelector(".arc-sp").style.backgroundPosition = arcPos(me);
        arcSound("reveal"); arcVibe(12);

        let result, txt;
        if (me === cpu) { result = "d"; txt = `Both threw ${label[me]} — <b>draw</b>.`; arcSound("pageFlip"); }
        else if (beats[me] === cpu) {
          st.me++; result = "w"; txt = `${label[me]} beats ${label[cpu]} — <b>you take the round!</b>`;
          arcSound("ding"); arcVibe(10); arcConfetti(8);
        } else {
          st.cpu++; result = "l"; txt = `${label[cpu]} beats ${label[me]} — <b>CPU takes the round.</b>`;
          arcSound("buzzer"); arcVibe([20,30]);
        }
        st.history.push(result);
        arcOut("#arcRpsOut", txt, result === "w" ? "good" : result === "l" ? "bad" : "info");
        refresh(); save();
        arcLater(() => { [meEl, cpuEl].forEach((e) => e && e.classList.remove("reveal")); }, 450);

        if (st.me >= 3 || st.cpu >= 3) {
          const won = st.me >= 3;
          if (won) {
            const bonus = 40 + st.history.filter((x) => x === "w").length * 5;
            addTokens(bonus); best("rps", st.me); arcWin(); st.match++;
            arcOut("#arcRpsOut", `<b>MATCH WON!</b> +${bonus} tokens`, "good");
            arcConfetti(60); arcFlash(); arcSound("achievement"); arcVibe([20,40,20,40]);
            arcSyncTokens(true, bonus);
          } else {
            arcLoss(); st.match++;
            arcOut("#arcRpsOut", "<b>Match lost.</b> The CPU read you — try a new mix.", "bad");
            arcSound("crowdJeer");
          }
          save(); refresh(); render();
          arcLater(() => { reset(); setButtons(true); if (call) call.textContent = "READY"; arcOut("#arcRpsOut", "New match — pick your throw.", "info"); }, 1300);
        } else {
          setButtons(true);
          arcLater(() => { if (call) call.textContent = "YOUR THROW"; }, 800);
        }
      }, 780);
    });
    const r = $("#mfRpsReset");
    if (r) r.onclick = () => { arcCleanup(); reset(); setButtons(true); if (call) call.textContent = "READY"; arcOut("#arcRpsOut", "New match — pick your throw.", "info"); play("choice"); };
    const arcPos = (k) => {
      const map = { r:"rock", p:"paper", s:"scissors" };
      const p = ARC_SPR[map[k]] || ARC_SPR.rock;
      return `${(p[0]/7*100).toFixed(4)}% ${(p[1]/4*100).toFixed(4)}%`;
    };
    if (meEl) meEl.querySelector(".arc-sp").style.backgroundPosition = arcPos("r");
    if (cpuEl) cpuEl.querySelector(".arc-sp").style.backgroundPosition = arcPos("r");
    refresh(); setButtons(true);
    if (call) call.textContent = "YOUR THROW";
    arcOut("#arcRpsOut", "First to three wins takes the match.", "info");
  }

  /* ------------------------------------------------------------------ *
   * 9. Settings screen helpers
   * ------------------------------------------------------------------ */
  function openSettingsScreen() {
    play("choice");
    try {
      if (window.SETTINGS_UI && typeof SETTINGS_UI.openSettings === "function") {
        SETTINGS_UI.openSettings();
        return;
      }
    } catch (e) {}
    // Fallback: our own Settings screen if settings.js is not present.
    showScreen("SETTINGS", `<div class="mf-wrap"><div class="mf-lead">Settings</div>
      ${row(ico("access"), "Accessibility", "Voice navigation", 'data-mf-set="accessibility"')}
      ${row(ico("challenge"), "Announce Challenges", "Display new challenges", 'data-mf-set="challenges"')}
      ${row(ico("half"), "Half-Year Age Up", "Two age ups per year", 'data-mf-set="halfYear"')}
      ${row(ico("haptic"), "Haptics", "Good vibrations", 'data-mf-set="haptics"')}
      ${row(ico("game"), "Mini-Games", "Mini-games, mega-fun", 'data-mf-set="minigames"')}
      ${row(ico("globe"), "Languages", "Choose your language", 'data-mf-set="languages"')}
      </div>`, openMainMenu);
    $$("[data-mf-set]").forEach((el) => el.onclick = () => openFeature(el.dataset.mfSet));
  }
  function syncSettingsRows() {
    try {
      if ((sTitle && sTitle.dataset.mfKey ? sTitle.dataset.mfKey : (sTitle ? sTitle.textContent : "")) !== "SETTINGS") return;
      $$("[data-st]").forEach((el) => {
        const k = el.dataset.st;
        if (["accessibility", "challenges", "halfYear", "haptics"].includes(k)) setBoxVisual(el, !!cfg[k]);
        if (k === "minigames") setBoxVisual(el, true);
        if (k === "languages") setBoxVisual(el, cfg.language !== "en");
      });
    } catch (e) {}
  }
  function openFeature(key) {
    ({
      accessibility: openAccessibility,
      challenges: () => { cfg.challenges = !cfg.challenges; save(); syncSettingsRows(); openChallenges(); },
      halfYear: openHalfYear,
      haptics: openHaptics,
      minigames: openArcade,
      languages: openLanguages,
    }[key] || openSettingsScreen)();
  }

  function openHalfYear() {
    const L = life();
    showScreen("HALF-YEAR AGE UP", `<div class="mf-wrap">
      <div class="mf-lead">With Half-Year Age Up on, each tap of <b>Age</b> covers six months. The first tap passes half a year (with a small stat drift and a life-story line); the second tap completes the year and runs the game's full yearly tick as usual.</div>
      <div class="mf-card"><h4>Status</h4>
        <div class="mf-inline"><span class="mf-tag ${cfg.halfYear ? "" : "off"}">${cfg.halfYear ? "ON" : "OFF"}</span>
        <span class="mf-muted">Next tap: ${L.halfPhase ? "completes the year" : "passes six months"}</span></div>
        <div class="mf-inline" style="margin-top:10px">
          <button class="mf-btn ${cfg.halfYear ? "on" : ""}" id="mfHalfToggle">${cfg.halfYear ? "Turn off" : "Turn on"}</button>
          <button class="mf-btn" id="mfHalfReset">Reset half-year position</button>
        </div>
      </div>
      <div class="sec">What changes</div>
      ${row(ico("half"), "Two taps per year", "Age only increments on the second tap", "")}
      ${row(ico("star"), "Half-year drift", "Small, gentle stat changes between years", "")}
      ${row(ico("floppy"), "Saved with the life", "The half-year position is stored in your save", "")}
      <div class="mf-sub">Turning it off mid-year simply completes the year on the next tap.</div>
    </div>`, openSettingsScreen);
    const t = $("#mfHalfToggle");
    if (t) t.onclick = () => { cfg.halfYear = !cfg.halfYear; save(); syncSettingsRows(); openHalfYear(); };
    const r = $("#mfHalfReset");
    if (r) r.onclick = () => { const L2 = life(); L2.halfPhase = 0; notify("Half-Year Age Up", "Position reset. Your next Age tap starts a new half-year."); openHalfYear(); };
  }

  /* ------------------------------------------------------------------ *
   * 10. Languages — real, switchable UI translation
   * ------------------------------------------------------------------ */
  function tr(s) {
    const d = (LANGS[cfg.language] || LANGS.en).m;
    return d[s] || s;
  }
  function openLanguages() {
    const codes = Object.keys(LANGS);
    const dict = (LANGS[cfg.language] || LANGS.en).m;
    const base = Object.keys(LANGS.es.m).length; // reference dictionary size
    const covered = Object.keys(dict).length;
    const browser = (navigator.language || "en").slice(0, 2).toLowerCase();
    showScreen("LANGUAGES", `<div class="mf-wrap">
      <div class="mf-lead">Translates the game's menus, screens, buttons and common labels. Anything a language doesn't cover stays in English — the same way real apps fall back. Life-story text, names and numbers are never translated.</div>
      <div class="mf-card"><h4>Current</h4><div class="mf-inline"><span class="mf-big">${esc(langName(cfg.language))}</span>
        <span class="mf-muted" style="margin-left:auto">${cfg.language === "en" ? "Original" : covered + " / " + base + " phrases"}</span></div>
        <div class="mf-inline" style="margin-top:10px">
          <button class="mf-btn" id="mfLangReset">Use English</button>
          ${LANGS[browser] && browser !== "en" ? `<button class="mf-btn" id="mfLangAuto">Match browser (${esc(langName(browser))})</button>` : ""}
        </div></div>
      <div class="sec">Available languages</div>
      ${codes.map((c) => row("", langName(c) + (c === cfg.language ? " ✓" : ""),
        c === "en" ? "Original game text" : Object.keys(LANGS[c].m).length + " translated phrases",
        `data-mf-lang="${c}"`)).join("")}
      <div class="sec">Preview</div>
      <div class="mf-card"><div class="mf-muted">${esc(tr("MAIN MENU"))} · ${esc(tr("ACTIVITIES"))} · ${esc(tr("SETTINGS"))}</div>
        <div class="mf-inline" style="margin-top:8px"><span class="mf-btn on">${esc(tr("Save"))}</span><span class="mf-btn">${esc(tr("Cancel"))}</span></div></div>
      <div class="mf-sub">Voice Navigation reads using the language you pick here. Right-to-left scripts are not included.</div>
    </div>`, openSettingsScreen);
    $$("[data-mf-lang]").forEach((el) => el.onclick = () => setLanguage(el.dataset.mfLang));
    const r = $("#mfLangReset"); if (r) r.onclick = () => setLanguage("en");
    const a = $("#mfLangAuto"); if (a) a.onclick = () => setLanguage(browser);
  }
  function setLanguage(code) {
    if (!LANGS[code]) return;
    cfg.language = code; save();
    translateAll();
    syncSettingsRows();
    // No popup here: rapidly switching languages must not queue notices that
    // would later block real game popups. The screen shows the current choice.
    openLanguages();
  }

  /* ------------------------------------------------------------------ *
   * 11. Restore Earlier Purchase — snapshot + portable restore code
   * ------------------------------------------------------------------ */
  const TRACK_KEYS = ["bitlifepp-owned", "bitlifepp-ported", "bitlifepp-ach", "bitlifepp-theme"];
  function readKey(k) {
    try {
      const v = localStorage.getItem(k);
      if (v == null) return null;
      return JSON.parse(v);
    } catch (e) { try { return localStorage.getItem(k); } catch (e2) { return null; } }
  }
  function snapshotPurchases() {
    const o = {};
    for (const k of TRACK_KEYS) o[k] = readKey(k);
    o.features = {
      ownedPacks: cfg.ownedPacks.slice(), ownedJobs: cfg.ownedJobs.slice(),
      tokens: cfg.tokens, challengePoints: cfg.challengePoints,
      customCities: cfg.customCities.slice(), customPeople: cfg.customPeople.slice(),
      favorites: cfg.favorites.slice(), teamNames: clone(cfg.teamNames),
    };
    return { v: 1, ts: Date.now(), data: o };
  }
  let backingUp = false;
  function backupNow() {
    if (backingUp) return;
    backingUp = true;
    try {
      const snap = snapshotPurchases();
      const cur = cfg.restoreBackup;
      // Keep the RICHEST snapshot: never replace a fuller backup with a sparser one.
      const score = (s) => s && s.data ? JSON.stringify(s.data).length : -1;
      if (!cur || score(snap) >= score(cur)) { cfg.restoreBackup = snap; save(); }
    } catch (e) {}
    backingUp = false;
  }
  function b64encode(str) {
    try { return btoa(String.fromCharCode.apply(null, new TextEncoder().encode(str))); }
    catch (e) { return btoa(unescape(encodeURIComponent(str))); }
  }
  function b64decode(str) {
    try {
      const bin = atob(str);
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch (e) { return decodeURIComponent(escape(atob(str))); }
  }
  function copyText(txt, okMsg) {
    const done = () => notify("Copied", okMsg || "Copied to your clipboard.");
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(done, () => fallback());
        return;
      }
    } catch (e) {}
    fallback();
    function fallback() {
      try {
        const ta = document.createElement("textarea");
        ta.value = txt; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        const ok = document.execCommand("copy"); ta.remove();
        notify(ok ? "Copied" : "Copy this code", ok ? (okMsg || "Copied to your clipboard.") : txt);
      } catch (e) { notify("Copy this code", txt); }
    }
  }
  function mergeRestore(snap, label) {
    if (!snap || !snap.data || typeof snap.data !== "object") {
      notify("Restore", "That restore code isn't valid. Copy the whole code and try again.");
      return false;
    }
    const d = snap.data;
    let count = 0;
    for (const k of TRACK_KEYS) {
      if (d[k] == null) continue;
      try {
        const cur = readKey(k);
        if (Array.isArray(d[k]) && Array.isArray(cur)) {
          const merged = Array.from(new Set(cur.concat(d[k])));
          if (merged.length > cur.length) { localStorage.setItem(k, JSON.stringify(merged)); count += merged.length - cur.length; }
        } else if (cur == null) {
          localStorage.setItem(k, typeof d[k] === "string" ? d[k] : JSON.stringify(d[k])); count++;
        }
      } catch (e) {}
    }
    if (d.features && typeof d.features === "object") {
      const f = d.features;
      for (const k of ["ownedPacks", "ownedJobs", "customCities", "customPeople", "favorites"]) {
        if (!Array.isArray(f[k])) continue;
        const cur = cfg[k] || [];
        const merged = Array.from(new Set(cur.concat(f[k])));
        if (merged.length > cur.length) { cfg[k] = merged; count += merged.length - cur.length; }
      }
      if (f.teamNames && typeof f.teamNames === "object")
        cfg.teamNames = Object.assign({}, f.teamNames, cfg.teamNames);
      if (Number.isFinite(f.tokens)) cfg.tokens = Math.max(num(cfg.tokens), f.tokens);
      if (Number.isFinite(f.challengePoints)) cfg.challengePoints = Math.max(num(cfg.challengePoints), f.challengePoints);
      save();
    }
    try { if (window.BL_MODS && typeof BL_MODS.reapply === "function") BL_MODS.reapply(); } catch (e) {}
    try {
      if (typeof applyTheme === "function" && typeof liveTheme === "function") applyTheme(liveTheme());
    } catch (e) {}
    applyCustomCities(); applyTeamOverrides();
    vibe([20, 40, 20]);
    notify("Purchases restored", `${label}: ${count} item${count === 1 ? "" : "s"} restored. Owned packs, mods, achievements and themes are active again.`);
    return true;
  }
  function openRestore() {
    backupNow();
    const snap = cfg.restoreBackup;
    const d = snap && snap.data ? snap.data : {};
    const owned = Array.isArray(d["bitlifepp-owned"]) ? d["bitlifepp-owned"].length : (d["bitlifepp-owned"] ? 1 : 0);
    const ported = Array.isArray(d["bitlifepp-ported"]) ? d["bitlifepp-ported"].length : 0;
    const ach = Array.isArray(d["bitlifepp-ach"]) ? d["bitlifepp-ach"].length : 0;
    showScreen("RESTORE PURCHASES", `<div class="mf-wrap">
      <div class="mf-lead">Everything in this game is free, so "purchases" means the packs, mods, themes and achievements you've collected. This screen keeps a snapshot on this device and lets you carry it anywhere with a restore code.</div>
      <div class="mf-card"><h4>Snapshot on this device</h4>
        <table class="mf-table">
          <tr><td>Marketplace packs</td><td>${owned}</td></tr>
          <tr><td>Ported mods</td><td>${ported}</td></tr>
          <tr><td>Achievements</td><td>${ach}</td></tr>
          <tr><td>Expansion packs</td><td>${cfg.ownedPacks.length}</td></tr>
          <tr><td>Job packs</td><td>${cfg.ownedJobs.length}</td></tr>
        </table>
        <div class="mf-inline"><button class="mf-btn" id="mfRestoreLocal">Restore from this device</button>
          <button class="mf-btn" id="mfRestoreCopy">Copy restore code</button></div></div>
      <div class="sec">Have a restore code?</div>
      <div class="mf-card">
        <label class="mf-lab">Paste your restore code</label>
        <textarea class="mf-input" id="mfRestoreCode" rows="3" placeholder="Paste the code you copied earlier" data-mf-noi18n></textarea>
        <button class="mf-btn" id="mfRestorePaste">Restore from code</button>
      </div>
      <div class="mf-sub">The code only contains your own collected items — no account data, passwords or life story.</div>
    </div>`, openSettingsScreen);
    const l = $("#mfRestoreLocal"); if (l) l.onclick = () => { backupNow(); mergeRestore(cfg.restoreBackup, "From this device"); };
    const c = $("#mfRestoreCopy");
    if (c) c.onclick = () => { backupNow(); copyText("FLPP1:" + b64encode(JSON.stringify(cfg.restoreBackup)), "Restore code copied. Save it somewhere safe, then paste it here on another device."); };
    const p = $("#mfRestorePaste");
    if (p) p.onclick = () => {
      const ta = $("#mfRestoreCode");
      const raw = ta ? String(ta.value || "").trim() : "";
      if (!raw) { notify("Restore", "Paste a restore code first."); return; }
      try {
        const json = b64decode(raw.replace(/^FLPP1:/, ""));
        mergeRestore(JSON.parse(json), "From restore code");
      } catch (e) { notify("Restore", "That restore code isn't valid. Copy the whole code and try again."); }
    };
  }

  // Keep the snapshot fresh whenever the game writes a purchase key.
  function hookPurchaseBackup() {
    try {
      const proto = window.Storage && window.Storage.prototype;
      if (!proto || !proto.setItem || proto.__mfHooked) return;
      const orig = proto.setItem;
      proto.setItem = function (k, v) {
        const r = orig.apply(this, arguments);
        try { if (TRACK_KEYS.indexOf(String(k)) >= 0) backupNow(); } catch (e) {}
        return r;
      };
      proto.__mfHooked = true;
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   * 12. Custom content editors (real, persisted, injected into the game)
   * ------------------------------------------------------------------ */
  function stateCode(c) {
    try {
      const U = window.US_STATES;
      if (!U) return "us";
      if (U.data[c]) return c;
      return U.stateOfCity(c) || "CA";
    } catch (e) { return "us"; }
  }
  function countryOptions(sel) {
    let out = "";
    try {
      const U = window.US_STATES;
      const codes = U ? U.list() : ["us"];
      out = codes.map((c) => `<option value="${esc(c)}"${c === sel ? " selected" : ""}>${esc(U ? U.name(c) : "United States")}</option>`).join("");
    } catch (e) {}
    return out || '<option value="CA">California</option>';
  }
  function countryName(c) {
    try {
      const U = window.US_STATES;
      if (U && U.data[c]) return U.name(c);
      if (U && U.data[U.stateOfCity(c)]) return U.name(U.stateOfCity(c));
    } catch (e) {}
    return "United States";
  }
  function applyCustomCities() {
    try {
      const C = window.CITIES;
      if (!C) return;
      for (const x of cfg.customCities) {
        if (!x || !x.name) continue;
        const k = stateCode(x.country || x.state);
        if (!Array.isArray(C.us)) C.us = [];
        if (C.us.indexOf(x.name) < 0) C.us.push(x.name);
        if (window.US_STATES) US_STATES.addCity(k, x.name);
      }
      try { if (window.US_STATES) US_STATES.applyCustom(cfg.customCities); } catch (e) {}
    } catch (e) {}
  }
  function openCustomCities() {
    applyCustomCities();
    const list = cfg.customCities.length ? cfg.customCities.map((x, i) =>
      `<div class="row" data-mf-city="${i}"><img src="${ico("city")}" alt=""><div class="t"><b>${esc(x.name)}</b><span>${esc(countryName(x.country))} · appears in city pickers and relocations</span></div><div class="mf-row-actions"><button class="mf-mini" data-mf-go="${i}">Move here</button><button class="mf-mini" data-mf-del="${i}">Delete</button></div></div>`).join("")
      : '<div class="mf-lead">No custom cities yet. Add one below and it will show up in the city lists in the game.</div>';
    showScreen("CUSTOM CITIES", `<div class="mf-wrap">
      <div class="mf-lead">Add your hometown to the game. Custom cities are saved on this device and injected into the real state city lists (New Life, Relocate, My State) as soon as you add them.</div>
      <div class="sec">Your cities</div>${list}
      <div class="sec">Add a city</div>
      <div class="mf-card">
        <label class="mf-lab">State</label><select class="mf-input" id="mfCityCountry">${countryOptions("us")}</select>
        <label class="mf-lab">City name</label><input class="mf-input" id="mfCityName" maxlength="48" placeholder="e.g. Springfield">
        <button class="mf-btn" id="mfCityAdd">Add city</button>
      </div>
      <div class="mf-sub">${cfg.customCities.length} custom ${cfg.customCities.length === 1 ? "city" : "cities"} · changes apply immediately, no restart needed.</div>
    </div>`, openMainMenu);
    const add = $("#mfCityAdd");
    if (add) add.onclick = () => {
      const n = $("#mfCityName"), c = $("#mfCityCountry");
      const name = n ? String(n.value || "").trim() : "";
      const code = c ? String(c.value || "us") : "us";
      if (!name) { notify("Custom Cities", "Type a city name first."); return; }
      if (cfg.customCities.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.country === code)) {
        notify("Custom Cities", "That city is already in your list."); return;
      }
      cfg.customCities.push({ id: "c" + Date.now(), name: name.slice(0, 48), country: code });
      save(); applyCustomCities(); play("choice"); openCustomCities();
    };
    $$("[data-mf-del]").forEach((b) => b.onclick = () => {
      const i = +b.dataset.mfDel;
      const x = cfg.customCities[i];
      if (!x) return;
      // Remove from the live CITIES arrays too.
      try { const C = window.CITIES; if (C && Array.isArray(C[x.country])) C[x.country] = C[x.country].filter((n) => n !== x.name); } catch (e) {}
      cfg.customCities.splice(i, 1); save(); play("choice"); openCustomCities();
    });
    $$("[data-mf-go]").forEach((b) => b.onclick = () => {
      const x = cfg.customCities[+b.dataset.mfGo]; if (!x) return;
      try {
        state.country = "us"; state.usState = stateCode(x.country || x.state); state.city = x.name;
        sayIt(`I moved to ${x.name}, ${state.usState}.`);
        notify("Moved", `You now live in ${x.name}, ${countryName(state.usState)}.`);
        render(); vibe(15);
      } catch (e) { notify("Custom Cities", "Couldn't move there in this life."); }
    });
  }

  const FIRST_NAMES = {
    m: ["Alex", "Ben", "Caleb", "Diego", "Eli", "Finn", "Gabe", "Hugo", "Ivan", "Jonah", "Kai", "Leo", "Milo", "Noah", "Omar", "Pablo", "Quinn", "Ravi", "Sam", "Theo"],
    f: ["Ada", "Bea", "Cleo", "Daisy", "Ella", "Freya", "Gia", "Hana", "Iris", "Jade", "Kira", "Lena", "Mia", "Nora", "Opal", "Priya", "Ruby", "Sofia", "Tess", "Zoe"],
  };
  const LAST_NAMES = ["Smith", "Johnson", "Garcia", "Lee", "Brown", "Novak", "Patel", "Kim", "Silva", "Dubois", "Haddad", "Okafor", "Rossi", "Nguyen", "Cohen", "Muller"];
  function fallbackLook(g) {
    try { if (typeof randomLook === "function") return randomLook(g, 25); } catch (e) {}
    return { skin: "#d9a274", eyes: "#6b4226", hair: "#2a201b", seed: rnd(1, 999), beard: g === "m" ? 2 : 0, hairCut: "short1" };
  }
  function openCustomPeople() {
    const list = cfg.customPeople.length ? cfg.customPeople.map((x, i) =>
      `<div class="row" data-mf-person="${i}"><img src="${ico("people")}" alt=""><div class="t"><b>${esc(x.first)} ${esc(x.last)}</b><span>${esc(x.g === "f" ? "Female" : "Male")} · ${esc(x.age)} · ${esc(x.job || "Friend")} · saved on this device</span></div><div class="mf-row-actions"><button class="mf-mini" data-mf-invite="${i}">Invite into this life</button><button class="mf-mini" data-mf-pdel="${i}">Delete</button></div></div>`).join("")
      : '<div class="mf-lead">No custom people yet. Add a friend below, then invite them into your current life.</div>';
    showScreen("CUSTOM PEOPLE", `<div class="mf-wrap">
      <div class="mf-lead">Make your friends appear in the game. Saved people can be invited into any life as a real friend — they show up in Relationships and take part in the game's friend events.</div>
      <div class="sec">Your people</div>${list}
      <div class="sec">Add a person</div>
      <div class="mf-card">
        <label class="mf-lab">First name</label><input class="mf-input" id="mfPFirst" maxlength="24" placeholder="First name">
        <label class="mf-lab">Last name</label><input class="mf-input" id="mfPLast" maxlength="24" placeholder="Last name">
        <label class="mf-lab">Gender</label><select class="mf-input" id="mfPG"><option value="m">Male</option><option value="f">Female</option></select>
        <label class="mf-lab">Age</label><input class="mf-input" id="mfPAge" type="number" min="1" max="99" value="25">
        <label class="mf-lab">Occupation (shown on their profile)</label><input class="mf-input" id="mfPJob" maxlength="32" placeholder="e.g. Teacher">
        <button class="mf-btn" id="mfPAdd">Add person</button>
        <button class="mf-btn" id="mfPRandom">Surprise me</button>
      </div>
      <div class="mf-sub">${cfg.customPeople.length} saved ${cfg.customPeople.length === 1 ? "person" : "people"}.</div>
    </div>`, openMainMenu);
    const add = $("#mfPAdd");
    if (add) add.onclick = () => {
      const first = String(($("#mfPFirst") || {}).value || "").trim();
      const last = String(($("#mfPLast") || {}).value || "").trim();
      const g = String(($("#mfPG") || {}).value || "m") === "f" ? "f" : "m";
      const a = Math.max(1, Math.min(99, Math.round(num(($("#mfPAge") || {}).value) || 25)));
      const job = String(($("#mfPJob") || {}).value || "").trim().slice(0, 32);
      if (!first) { notify("Custom People", "Give them a first name first."); return; }
      cfg.customPeople.push({ id: "p" + Date.now(), first: first.slice(0, 24), last: (last || pick(LAST_NAMES)).slice(0, 24), g, age: a, job });
      save(); play("choice"); openCustomPeople();
    };
    const r = $("#mfPRandom");
    if (r) r.onclick = () => {
      const g = pick(["m", "f"]);
      const f = $("#mfPFirst"), l = $("#mfPLast"), gg = $("#mfPG"), a = $("#mfPAge"), j = $("#mfPJob");
      if (f) f.value = pick(FIRST_NAMES[g]); if (l) l.value = pick(LAST_NAMES);
      if (gg) gg.value = g; if (a) a.value = rnd(16, 60); if (j) j.value = pick(["Teacher", "Chef", "Nurse", "Artist", "Engineer", "Musician", "Barista", "Writer"]);
    };
    $$("[data-mf-pdel]").forEach((b) => b.onclick = () => {
      cfg.customPeople.splice(+b.dataset.mfPdel, 1); save(); play("choice"); openCustomPeople();
    });
    $$("[data-mf-invite]").forEach((b) => b.onclick = () => {
      const x = cfg.customPeople[+b.dataset.mfInvite]; if (!x) return;
      try {
        if (!Array.isArray(state.friends)) state.friends = [];
        if (state.friends.some((f) => f.first === x.first && f.last === x.last)) {
          notify("Custom People", `${x.first} is already in this life.`); return;
        }
        state.friends.push({
          first: x.first, last: x.last, g: x.g, look: fallbackLook(x.g),
          ageOffset: x.age - age(), rel: 75, since: age(),
          prof: x.job ? { job: x.job } : undefined,
        });
        sayIt(`I became friends with ${x.first} ${x.last}.`);
        notify("New friend", `${x.first} ${x.last} is now in your Relationships.`);
        vibe(15);
        // No forced navigation here: a timed openRelationships() would tear
        // away whatever screen the player moved on to.
      } catch (e) { notify("Custom People", "Couldn't add them to this life."); }
    });
  }

  const DEFAULT_TEAMS = ["City Hawks", "River Kings", "North Stars", "Bay Sharks", "Mountain Foxes", "Lake Bears", "Golden Eagles", "Red Comets", "Valley Wolves", "Harbor Suns", "Prairie Bulls", "Crystal Knights"];
  function ensureLeague() {
    try {
      if (state.bbLeague && Array.isArray(state.bbLeague.teams)) return state.bbLeague;
      state.bbLeague = { teams: DEFAULT_TEAMS.map((name, i) => ({ i, name, str: rnd(38, 95), champs: rnd(0, 6), place: i + 1 })) };
      return state.bbLeague;
    } catch (e) { return null; }
  }
  function applyTeamOverrides() {
    try {
      const L = state.bbLeague;
      if (!L || !Array.isArray(L.teams)) return;
      if (!cfg.teamDefaults.length) cfg.teamDefaults = L.teams.map((t) => t.name);
      for (const k of Object.keys(cfg.teamNames)) {
        const i = +k, t = L.teams[i];
        if (t && cfg.teamNames[k]) t.name = String(cfg.teamNames[k]).slice(0, 40);
      }
    } catch (e) {}
  }
  function openSportsTeams() {
    ensureLeague();
    applyTeamOverrides();
    const teams = (state.bbLeague && state.bbLeague.teams) || [];
    const rows = teams.map((t, i) =>
      `<div class="row"><img src="${ico("sports")}" alt=""><div class="t"><b>Team ${i + 1}</b><span>Strength ${t.str} · ${t.champs} titles</span></div>
       <div class="mf-row-actions"><input class="mf-input" style="width:150px;margin:0" data-mf-team="${i}" value="${esc(t.name)}" maxlength="40"></div></div>`).join("");
    showScreen("EDIT SPORTS TEAMS", `<div class="mf-wrap">
      <div class="mf-lead">Rename the teams in your basketball league. Names are saved across lives and re-applied whenever a new league is created — the game uses them for standings, matches and news.</div>
      <div class="sec">League teams</div>
      ${rows || '<div class="mf-lead">No league yet.</div>'}
      <div class="mf-inline" style="margin-top:12px"><button class="mf-btn" id="mfTeamSave">Save names</button>
        <button class="mf-btn" id="mfTeamReset">Reset to defaults</button>
        ${!teams.length ? '<button class="mf-btn" id="mfTeamCreate">Create league now</button>' : ""}</div>
      <div class="mf-sub">${Object.keys(cfg.teamNames).length} renamed.</div>
    </div>`, openMainMenu);
    const s = $("#mfTeamSave");
    if (s) s.onclick = () => {
      let n = 0;
      $$("[data-mf-team]").forEach((inp) => {
        const i = inp.dataset.mfTeam, v = String(inp.value || "").trim().slice(0, 40);
        if (!v) return;
        const base = cfg.teamDefaults[+i] || DEFAULT_TEAMS[+i];
        if (v === base) delete cfg.teamNames[i]; else { cfg.teamNames[i] = v; n++; }
      });
      save(); applyTeamOverrides(); play("choice");
      notify("Teams saved", `${n} team ${n === 1 ? "name" : "names"} saved. They'll be used in every life on this device.`);
      openSportsTeams();
    };
    const r = $("#mfTeamReset");
    if (r) r.onclick = () => { cfg.teamNames = {}; save(); applyTeamOverrides(); openSportsTeams(); notify("Teams reset", "All team names are back to their defaults."); };
    const c = $("#mfTeamCreate");
    if (c) c.onclick = () => { ensureLeague(); cfg.teamDefaults = []; applyTeamOverrides(); openSportsTeams(); };
  }

  const ACTIVITY_LIST = [
    ["accessories", "Accessories", "accessories"], ["adoption", "Adoption", "adoption"],
    ["crime", "Crime", "crime"], ["doctor", "Doctor", "doctor"], ["emigrate", "Relocate", "passport"],
    ["fertility", "Fertility", "fertility"], ["fight", "Fight Betting", "fight"], ["gamble", "Gamble", "gamble"],
    ["horse", "Horse Races", "horse"], ["hunting", "Hunting & Fishing", "hunting"], ["identity", "Identity", "identity"],
    ["lawsuit", "Lawsuit", "lawsuit"], ["licenses", "Licenses", "licenses"], ["loan", "Loan", "loan"],
    ["lottery", "Lottery", "lottery"], ["love", "Love", "love"], ["mindbody", "Mind & Body", "mindbody"],
    ["movies", "Movie Theater", "movies"], ["nightlife", "Nightlife", "nightlife"], ["pets", "Pets", "pets"], ["politics", "Political Career", "../politics/capitol"],
    ["surgery", "Plastic Surgery", "surgery"], ["pray", "Pray", "pray"], ["rehab", "Rehab", "rehab"],
    ["salon", "Salon & Spa", "salon"], ["shopping", "Shopping", "shopping"], ["social", "Social Media", "social"],
    ["sweepstakes", "Sweepstakes", "sweepstakes"], ["therapy", "Therapy", "therapy"],
    ["timemachine", "Time Machine", "timemachine"], ["vacation", "Vacation", "vacation"],
    ["will", "Will & Testament", "will"], ["zoo", "Zoo Trip", "zoo"],
  ];
  const ACT_NAME = Object.fromEntries(ACTIVITY_LIST.map(([k, n]) => [k, n]));
  function openFavoriteActivities() {
    showScreen("FAVORITE ACTIVITIES", `<div class="mf-wrap">
      <div class="mf-lead">Pin the activities you use most. They appear in a <b>Favorites</b> section at the top of the Activities screen and launch straight into the real activity.</div>
      <div class="sec">All activities</div>
      ${ACTIVITY_LIST.map(([k, n, ic]) => `<div class="row" data-mf-fav="${k}"><img src="act/${esc(ic)}.png" alt=""><div class="t"><b>${esc(n)}</b><span>${cfg.favorites.includes(k) ? "Pinned" : "Tap to pin"}</span></div><span class="mf-tag ${cfg.favorites.includes(k) ? "" : "off"}">${cfg.favorites.includes(k) ? "PINNED" : "—"}</span></div>`).join("")}
      <div class="mf-inline" style="margin-top:12px"><button class="mf-btn" id="mfFavClear">Clear all</button></div>
      <div class="mf-sub">${cfg.favorites.length} pinned.</div>
    </div>`, openMainMenu);
    $$("[data-mf-fav]").forEach((el) => el.onclick = () => {
      const k = el.dataset.mfFav, i = cfg.favorites.indexOf(k);
      if (i >= 0) cfg.favorites.splice(i, 1); else cfg.favorites.push(k);
      save(); play("choice"); openFavoriteActivities();
    });
    const c = $("#mfFavClear");
    if (c) c.onclick = () => { cfg.favorites = []; save(); openFavoriteActivities(); };
  }

  /* ------------------------------------------------------------------ *
   * 13. My Stuff / Achievements / Help
   * ------------------------------------------------------------------ */
  function achList() {
    try { const v = JSON.parse(localStorage.getItem("bitlifepp-ach") || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function ownedMarket() {
    try { const v = JSON.parse(localStorage.getItem("bitlifepp-owned") || "[]"); return Array.isArray(v) ? v : []; }
    catch (e) { return []; }
  }
  function portedMods() {
    try { return window.BL_MODS && typeof BL_MODS.read === "function" ? BL_MODS.read() : []; }
    catch (e) { return []; }
  }
  function openMyStuff() {
    const market = ownedMarket(), mods = portedMods(), ach = achList();
    showScreen("MY STUFF", `<div class="mf-wrap">
      <div class="mf-lead">Everything you've collected on this device, in one place. These are account-wide: they follow you into every new life.</div>
      <div class="mf-card"><h4>At a glance</h4><table class="mf-table">
        <tr><td>Marketplace packs</td><td>${market.length}</td></tr>
        <tr><td>Ported mods</td><td>${mods.length}</td></tr>
        <tr><td>Expansion packs</td><td>${cfg.ownedPacks.length}</td></tr>
        <tr><td>Job packs</td><td>${cfg.ownedJobs.length}</td></tr>
        <tr><td>Achievements</td><td>${ach.length} / 410</td></tr>
        <tr><td>Arcade tokens</td><td>${num(cfg.tokens).toLocaleString("en-US")}</td></tr>
        <tr><td>Challenge points</td><td>${num(cfg.challengePoints).toLocaleString("en-US")}</td></tr>
        <tr><td>Custom cities / people</td><td>${cfg.customCities.length} / ${cfg.customPeople.length}</td></tr>
      </table></div>
      <div class="sec">Browse</div>
      ${row(ico("cart"), "Marketplace packs", market.length ? market.length + " owned" : "None yet", 'data-mf-go="market"')}
      ${row(ico("pack"), "Expansion packs", cfg.ownedPacks.length + " owned", 'data-mf-go="expansion"')}
      ${row(ico("bag"), "Job packs", cfg.ownedJobs.length + " owned", 'data-mf-go="jobs"')}
      ${row(ico("trophy"), "Achievements", ach.length + " / 410 earned", 'data-mf-go="ach"')}
      ${row(ico("game"), "Arcade", num(cfg.tokens) + " tokens", 'data-mf-go="arcade"')}
      <div class="sec">Account</div>
      ${row(ico("floppy"), "Restore Earlier Purchase", "Back up or carry your collection", 'data-mf-go="restore"')}
      ${row(ico("globe"), "My Account", "Open the in-game account screen", 'data-mf-go="account"')}
    </div>`, openMainMenu);
    const go = {
      market: () => safe(() => openMarketplace()), expansion: openExpansionPacks,
      jobs: openJobPacks, ach: openAchievements, arcade: openArcade,
      restore: openRestore, account: () => { try { if (window.blAccount && blAccount.open) blAccount.open(); else notify("My Account", "There's no account signed in on this device."); } catch (e) {} },
    };
    $$("[data-mf-go]").forEach((el) => el.onclick = () => { play("choice"); (go[el.dataset.mfGo] || openMyStuff)(); });
  }
  function openAchievements() {
    const list = achList();
    const hints = [
      "We All Started Somewhere", "Centenarian", "BITLIFE RECODED",
      "Gold Digger", "Baby Mama", "Vegas Baby", "Fertile", "Rich", "Famous", "Hero",
    ];
    showScreen("ACHIEVEMENTS", `<div class="mf-wrap">
      <div class="mf-lead">This game tracks 410 achievements. Here are the ones you've earned on this device — the rest unlock through ordinary play, milestones and rare events.</div>
      <div class="mf-card"><div class="mf-inline"><span class="mf-big">${list.length} / 410</span>
        <span class="mf-muted" style="margin-left:auto">${Math.round(list.length / 410 * 100)}% complete</span></div>
        <div class="mf-bar"><u style="width:${Math.min(100, list.length / 410 * 100)}%"></u></div></div>
      <div class="sec">Earned</div>
      ${list.length ? list.map((a) => row(ico("trophy"), String(a), "Unlocked", "")).join("") : '<div class="mf-lead">None yet. Keep living — your first achievement is usually "We All Started Somewhere".</div>'}
      <div class="sec">Things to try</div>
      ${hints.map((h) => row(ico("star"), h, list.includes(h) ? "Already earned" : "Not earned yet", "")).join("")}
    </div>`, openMainMenu);
  }
  const FAQ = [
    ["How do I save a life?", "Main Menu → Save Life saves to this browser. Lives are also saved automatically as you age. View Past Lives lets you switch between them."],
    ["Why did my family change when I switched lives?", "That was a bug in the heir snapshot — cousins, jobs, looks and genes were being re-rolled. It's fixed: cousins become aunts/uncles, nephews become cousins, and looks, jobs, genes and money are preserved."],
    ["The Back button takes me to the wrong screen", "Fixed. The floating Back tab now returns to the activity you were in, not the Activities menu. Sub-screens like Surrogates and the Horse Market also go back to where you came from."],
    ["Can I get packs without paying?", "Yes — everything in this build is free. Marketplace, Expansion Packs and Job Packs all just mark the pack as collected."],
    ["What are arcade tokens for?", "Win them in Mini-Games, then cash them out for real in-game money. 10 tokens = $10, once per game year."],
    ["How do I get my stuff on another device?", "Settings → Restore Earlier Purchase → Copy restore code. Paste that code on the other device to bring back your packs, mods, themes and achievements."],
    ["Do custom cities really appear in the game?", "Yes. They're injected into the real state city lists used by New Life, Relocate and My State as soon as you add them."],
    ["What does Half-Year Age Up do?", "Each Age tap covers six months. The first passes half a year with a small stat drift; the second completes the year and runs the full yearly tick."],
    ["Which languages are supported?", "Settings → Languages lists them. Menus, screens, buttons and common labels are translated; anything a language doesn't cover stays in English. Life-story text, names and numbers are never changed."],
    ["Is there a leaderboard offline?", "Yes. If the online leaderboard isn't reachable, the game shows a local one built from the lives saved on this device, sortable by age, net worth, children and lovers."],
  ];
  function openHelp(query) {
    const q = String(query || "").toLowerCase();
    const items = FAQ.filter(([a, b]) => !q || (a + " " + b).toLowerCase().includes(q));
    showScreen("HELP", `<div class="mf-wrap">
      <div class="mf-lead">Answers to the common stuff, plus a place to leave feedback. Everything here works offline.</div>
      <div class="mf-card"><label class="mf-lab">Search help</label>
        <input class="mf-input" id="mfHelpSearch" placeholder="e.g. saves, packs, languages" value="${esc(query || "")}" data-mf-noi18n>
        <button class="mf-btn" id="mfHelpGo">Search</button></div>
      <div class="sec">Answers ${q ? "· " + items.length + " match" + (items.length === 1 ? "" : "es") : ""}</div>
      ${items.length ? items.map(([a, b]) => `<div class="mf-card"><h4>${esc(a)}</h4><div class="mf-muted">${esc(b)}</div></div>`).join("") : '<div class="mf-lead">No matches. Try a shorter word.</div>'}
      <div class="sec">Send feedback</div>
      <div class="mf-card">
        <label class="mf-lab">Your note</label><textarea class="mf-input" id="mfHelpNote" rows="3" placeholder="A bug, an idea, or a suggestion…" data-mf-noi18n></textarea>
        <button class="mf-btn" id="mfHelpSave">Save note on this device</button>
        <button class="mf-btn" id="mfHelpCopy">Copy diagnostics</button>
      </div>
      <div class="sec">Saved notes</div>
      ${cfg.feedback.length ? cfg.feedback.slice(-5).reverse().map((f) => `<div class="mf-card"><div class="mf-muted">${esc(f)}</div></div>`).join("") : '<div class="mf-lead">No notes yet.</div>'}
      <div class="mf-sub">BitLife++ v3.25.1 · Free Life · all features on this screen are local to your browser.</div>
    </div>`, openMainMenu);
    const go = $("#mfHelpGo"); if (go) go.onclick = () => { const i = $("#mfHelpSearch"); openHelp(i ? i.value : ""); };
    const s = $("#mfHelpSave");
    if (s) s.onclick = () => {
      const t = $("#mfHelpNote"), v = t ? String(t.value || "").trim() : "";
      if (!v) { notify("Help", "Write a note first."); return; }
      cfg.feedback.push(v.slice(0, 400)); if (cfg.feedback.length > 50) cfg.feedback.shift();
      save(); notify("Feedback saved", "Your note is saved on this device. Thanks!"); openHelp();
    };
    const c = $("#mfHelpCopy");
    if (c) c.onclick = () => copyText([
      "Free Life / BitLife++ v3.25.1",
      "Browser: " + (navigator.userAgent || "unknown"),
      "Language: " + langName(cfg.language),
      "Life: " + (() => { try { return `${state.first} ${state.last}, age ${age()}`; } catch (e) { return "unknown"; } })(),
      "Features: " + ["accessibility", "challenges", "halfYear", "haptics"].filter((k) => cfg[k]).join(", ") || "none",
      "Packs: " + cfg.ownedPacks.length + " / Jobs: " + cfg.ownedJobs.length,
    ].join("\n"), "Diagnostics copied. Paste them with your bug report.");
  }

  /* ------------------------------------------------------------------ *
   * 14. Job Packs & Expansion Packs (real, with ventures)
   * ------------------------------------------------------------------ */
  function jobPacks() {
    try {
      if (typeof SPECIAL_PACKS !== "undefined" && Array.isArray(SPECIAL_PACKS))
        return SPECIAL_PACKS.map(([id, name, desc]) => ({ id, name, desc }));
    } catch (e) {}
    return [
      ["actor", "Actor", "Become a famous TV or movie star!"],
      ["astronaut", "Astronaut", "Explore the cosmos!"],
      ["business", "Business", "Start up, acquire, or lead a company!"],
      ["dealer", "Dealer", "Join a drug cartel!"],
      ["fighter", "Fighter", "Fight your way to a world title!"],
      ["mafia", "Mafia", "Join an organized crime syndicate!"],
      ["model", "Model", "Become a famous supermodel!"],
      ["producer", "Music Producer", "Become a famous music producer!"],
      ["musician", "Musician", "Join a band or go for a solo career!"],
      ["politician", "Politician", "Run for a political office!"],
      ["pope", "Pope", "Lead the Catholic Church!"],
      ["athlete", "Pro Athlete", "Become a professional athlete!"],
      ["hustler", "Street Hustler", "Hit the streets and get your hustle on!"],
    ].map(([id, name, desc]) => ({ id, name, desc }));
  }
  function openJobPacks() {
    const packs = jobPacks();
    showScreen("JOB PACKS", `<div class="mf-wrap">
      <div class="mf-lead">Job Packs open up the game's special career paths. Collect any pack for free, then browse the full-time job list to find the careers it highlights.</div>
      <div class="mf-card"><div class="mf-inline"><span class="mf-big">${cfg.ownedJobs.length} / ${packs.length}</span>
        <span class="mf-muted" style="margin-left:auto">collected</span></div>
        <div class="mf-inline" style="margin-top:8px"><button class="mf-btn" id="mfJobAll">Collect all (Boss Mode)</button>
          <button class="mf-btn" id="mfJobBrowse">Browse full-time careers</button></div></div>
      <div class="sec">Packs</div>
      ${packs.map((p) => `<div class="row" data-mf-job="${esc(p.id)}"><img src="${p.id === "pope" ? "church/rank-pope.png" : "special/" + esc(p.id) + ".png"}" alt=""><div class="t"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div><span class="mf-tag ${cfg.ownedJobs.includes(p.id) ? "" : "off"}">${cfg.ownedJobs.includes(p.id) ? "OWNED" : "FREE"}</span></div>`).join("")}
    </div>`, openMainMenu);
    $$("[data-mf-job]").forEach((el) => el.onclick = () => {
      const id = el.dataset.mfJob;
      if (cfg.ownedJobs.includes(id)) { notify("Job Packs", "You already collected that pack."); return; }
      cfg.ownedJobs.push(id); save(); play("choice"); vibe([20, 40, 20]);
      notify("Pack collected", `${(packs.find((p) => p.id === id) || {}).name || "Job pack"} is yours. Look for its careers in Occupation → Special Careers and the full-time job list.`);
      openJobPacks();
    });
    const a = $("#mfJobAll");
    if (a) a.onclick = () => { cfg.ownedJobs = packs.map((p) => p.id); save(); notify("Boss Mode", "All job packs collected. Every special career is now highlighted."); openJobPacks(); };
    const b = $("#mfJobBrowse");
    if (b) b.onclick = () => { play("choice"); try { if (typeof openJobs === "function") { openJobs("fulltime"); return; } } catch (e) {} openOccupationSafe(); };
  }
  function openOccupationSafe() { try { if (typeof openOccupation === "function") openOccupation(); } catch (e) {} }

  const EXPANSIONS = [
    { id: "landlord", name: "Landlord Expansion Pack", desc: "Collect rent from your properties.", icon: "houses/house3.png" },
    { id: "casino", name: "Casino Expansion Pack", desc: "Buy a casino and earn yearly profit.", icon: "act/gamble.png" },
    { id: "racing", name: "Racing Expansion Pack", desc: "Enter street races for double-or-nothing stakes.", icon: "cars/suv-red.png" },
    { id: "agent", name: "Secret Agent Expansion Pack", desc: "Take missions for cash rewards.", icon: "mafia/spy.png" },
    { id: "blackmarket", name: "Black Market Expansion Pack", desc: "Buy and flip contraband.", icon: "crime/pill.png" },
    { id: "zoo", name: "Zoo Expansion Pack", desc: "Collect animals and earn from your zoo.", icon: "act/zoo.png" },
  ];
  function ventures() {
    const L = life();
    if (!L.ventures || typeof L.ventures !== "object") L.ventures = {};
    const v = L.ventures;
    if (!v.casino) v.casino = { owned: false, invested: 0 };
    if (!v.zoo) v.zoo = { animals: [] };
    if (!Array.isArray(v.zoo.animals)) v.zoo.animals = [];
    if (!v.blackmarket) v.blackmarket = { items: [] };
    if (!Array.isArray(v.blackmarket.items)) v.blackmarket.items = [];
    if (!Number.isFinite(v.landlordYear)) v.landlordYear = -1;
    if (!Number.isFinite(v.casinoYear)) v.casinoYear = -1;
    if (!Number.isFinite(v.zooYear)) v.zooYear = -1;
    if (!Number.isFinite(v.racingYear)) v.racingYear = -1;
    if (!Number.isFinite(v.agentYear)) v.agentYear = -1;
    if (!Number.isFinite(v.bmYear)) v.bmYear = -1;
    if (!Number.isFinite(v.missions)) v.missions = 0;
    if (!Number.isFinite(v.raceWins)) v.raceWins = 0;
    return v;
  }
  const ANIMALS = [
    ["Lion", 120000, 6000], ["Elephant", 250000, 11000], ["Penguin", 40000, 2200],
    ["Red Panda", 65000, 3400], ["Snow Leopard", 180000, 8500], ["Parrot", 15000, 900],
    ["Dolphin", 320000, 15000], ["Tortoise", 22000, 1200],
  ];
  const CONTRABAND = [
    ["Crate of rare stamps", 8000], ["Vintage watch", 14000], ["Unmarked painting", 26000],
    ["Antique coins", 19000], ["Prototype gadget", 33000],
  ];
  function openExpansionPacks(focus) {
    const v = ventures();
    showScreen("EXPANSION PACKS", `<div class="mf-wrap">
      <div class="mf-lead">These used to be rows that just said "Error". Now each one is a real, playable side activity with its own state, saved with your life.</div>
      <div class="sec">Packs</div>
      ${EXPANSIONS.map((p) => `<div class="row" data-mf-exp="${p.id}"><img src="${esc(p.icon)}" alt=""><div class="t"><b>${esc(p.name)}</b><span>${esc(p.desc)}</span></div><span class="mf-tag ${cfg.ownedPacks.includes(p.id) ? "" : "off"}">${cfg.ownedPacks.includes(p.id) ? "OWNED" : "FREE"}</span></div>`).join("")}
      <div class="mf-card"><h4>Your ventures</h4><table class="mf-table">
        <tr><td>Casino</td><td>${v.casino.owned ? fmt(v.casino.invested) + " invested" : "Not owned"}</td></tr>
        <tr><td>Zoo animals</td><td>${v.zoo.animals.length}</td></tr>
        <tr><td>Contraband</td><td>${v.blackmarket.items.length} items</td></tr>
        <tr><td>Missions / race wins</td><td>${v.missions} / ${v.raceWins}</td></tr>
      </table></div>
      <div class="mf-sub">${cfg.ownedPacks.length} / ${EXPANSIONS.length} packs collected. All free.</div>
    </div>`, openMainMenu);
    $$("[data-mf-exp]").forEach((el) => el.onclick = () => {
      const id = el.dataset.mfExp;
      if (!cfg.ownedPacks.includes(id)) {
        cfg.ownedPacks.push(id); save(); play("choice"); vibe([20, 40, 20]);
        notify("Pack collected", `${(EXPANSIONS.find((p) => p.id === id) || {}).name || "Expansion pack"} is now available.`);
        openExpansionPacks(id); return;
      }
      openVenture(id);
    });
    if (focus && cfg.ownedPacks.includes(focus)) {
      // no auto-open; the player taps the pack
    }
  }
  function openVenture(id) {
    const v = ventures(), y = year();
    const back = () => openExpansionPacks();
    if (id === "landlord") {
      const props = (() => { try { return state.props || []; } catch (e) { return []; } })();
      const rent = props.reduce((s, p) => s + Math.round(num(p.price) * .006), 0);
      showScreen("LANDLORD", `<div class="mf-wrap"><div class="mf-lead">Collect rent from the properties you own. One collection per game year; the rent is 0.6% of each property's price.</div>
        <div class="mf-card"><h4>Your properties</h4><div class="mf-inline"><span class="mf-big">${props.length}</span><span class="mf-muted">owned</span>
        <span class="mf-muted" style="margin-left:auto">${fmt(rent)} / year</span></div></div>
        <div class="mf-inline"><button class="mf-btn" id="mfVGo">Collect rent</button><button class="mf-btn" id="mfVBack">Back</button></div></div>`, back);
      const g = $("#mfVGo");
      if (g) g.onclick = () => {
        if (v.landlordYear === y) { notify("Landlord", "You've already collected rent this year."); return; }
        if (!props.length) { notify("Landlord", "Buy a property first — Assets → Shopping → Real Estate Brokers."); return; }
        v.landlordYear = y; money(rent); sayIt(`I collected ${fmt(rent)} in rent from my properties.`);
        notify("Rent collected", `${fmt(rent)} added to your balance.`); vibe([20, 40, 20]); openVenture(id);
      };
    } else if (id === "casino") {
      const cost = 250000;
      showScreen("CASINO", `<div class="mf-wrap"><div class="mf-lead">Own a casino and it pays out 6–16% of your investment every year, automatically, as long as this life lasts.</div>
        <div class="mf-card"><h4>${v.casino.owned ? "Your casino" : "Buy a casino"}</h4>
          <div class="mf-inline"><span class="mf-big">${v.casino.owned ? fmt(v.casino.invested) : fmt(cost)}</span>
          <span class="mf-muted" style="margin-left:auto">${v.casino.owned ? "invested" : "one-time price"}</span></div></div>
        <div class="mf-inline">${v.casino.owned ? "" : `<button class="mf-btn" id="mfVGo">Buy for ${fmt(cost)}</button>`}
          <button class="mf-btn" id="mfVBack">Back</button></div></div>`, back);
      const g = $("#mfVGo");
      if (g) g.onclick = () => {
        if (!canPay(cost)) { notify("Casino", `You need ${fmt(cost)}. You have ${fmt(num(state.money))}.`); return; }
        money(-cost); v.casino.owned = true; v.casino.invested = cost;
        sayIt("I bought a casino."); notify("Casino bought", "It will pay out every year from now on."); vibe([20, 40, 20]); openVenture(id);
      };
    } else if (id === "racing") {
      const stake = 5000;
      showScreen("STREET RACES", `<div class="mf-wrap"><div class="mf-lead">Put ${fmt(stake)} on a street race. Win and you double it; lose and it's gone. One race per year.</div>
        <div class="mf-card"><h4>Record</h4><div class="mf-inline"><span class="mf-big">${v.raceWins}</span><span class="mf-muted">wins</span></div></div>
        <div class="mf-inline"><button class="mf-btn" id="mfVGo">Race for ${fmt(stake)}</button><button class="mf-btn" id="mfVBack">Back</button></div></div>`, back);
      const g = $("#mfVGo");
      if (g) g.onclick = () => {
        if (v.racingYear === y) { notify("Street Races", "One race a year — age up and come back."); return; }
        if (!canPay(stake)) { notify("Street Races", `You need ${fmt(stake)} to enter.`); return; }
        v.racingYear = y; money(-stake);
        const win = Math.random() < .52;
        if (win) { money(stake * 2); v.raceWins++; sayIt(`I won a street race and took home ${fmt(stake * 2)}.`); notify("You won!", `${fmt(stake * 2)} in the bag.`); }
        else { sayIt("I lost a street race."); notify("You lost", `${fmt(stake)} gone. Better luck next year.`); }
        vibe(win ? [20, 40, 20] : 15); openVenture(id);
      };
    } else if (id === "agent") {
      showScreen("SECRET AGENT", `<div class="mf-wrap"><div class="mf-lead">Take one mission a year. Harder missions pay more but are less likely to succeed.</div>
        <div class="mf-card"><h4>Missions completed</h4><div class="mf-big">${v.missions}</div></div>
        <div class="mf-inline"><button class="mf-btn" data-mf-mission="easy">Easy · ${fmt(6000)} · 85%</button>
          <button class="mf-btn" data-mf-mission="hard">Hard · ${fmt(25000)} · 55%</button>
          <button class="mf-btn" data-mf-mission="black">Black ops · ${fmt(80000)} · 30%</button></div>
        <div class="mf-inline"><button class="mf-btn" id="mfVBack">Back</button></div></div>`, back);
      const payouts = { easy: [6000, .85], hard: [25000, .55], black: [80000, .30] };
      $$("[data-mf-mission]").forEach((b) => b.onclick = () => {
        if (v.agentYear === y) { notify("Secret Agent", "One mission a year — age up first."); return; }
        const [pay, odds] = payouts[b.dataset.mfMission];
        v.agentYear = y;
        const win = Math.random() < odds;
        if (win) { money(pay); v.missions++; sayIt(`I completed a secret mission and was paid ${fmt(pay)}.`); notify("Mission complete", `${fmt(pay)} deposited.`); }
        else { sayIt("A secret mission went sideways."); notify("Mission failed", "No payment this time. Lay low until next year."); }
        vibe(win ? [20, 40, 20] : 15); openVenture(id);
      });
    } else if (id === "blackmarket") {
      showScreen("BLACK MARKET", `<div class="mf-wrap"><div class="mf-lead">Buy a mystery lot, then flip it. Sale prices move with the market — sometimes up, sometimes down.</div>
        <div class="mf-card"><h4>Your lots</h4>${v.blackmarket.items.length ? v.blackmarket.items.map((it, i) =>
          `<div class="row" data-mf-bm="${i}"><img src="crime/pill.png" alt=""><div class="t"><b>${esc(it.name)}</b><span>Bought for ${fmt(it.cost)} · sell now</span></div>${typeof DOTS !== "undefined" ? DOTS : ""}</div>`).join("")
          : '<div class="mf-muted">Nothing in storage.</div>'}</div>
        <div class="mf-inline"><button class="mf-btn" id="mfVBuy">Buy a lot (${fmt(12000)})</button><button class="mf-btn" id="mfVBack">Back</button></div></div>`, back);
      const b = $("#mfVBuy");
      if (b) b.onclick = () => {
        if (v.bmYear === y) { notify("Black Market", "One purchase a year — age up first."); return; }
        if (!canPay(12000)) { notify("Black Market", "You need $12,000 for a lot."); return; }
        v.bmYear = y; money(-12000);
        const [name] = pick(CONTRABAND);
        v.blackmarket.items.push({ name, cost: 12000 });
        sayIt(`I bought ${name.toLowerCase()} on the black market.`); openVenture(id);
      };
      $$("[data-mf-bm]").forEach((el) => el.onclick = () => {
        const i = +el.dataset.mfBm, it = v.blackmarket.items[i]; if (!it) return;
        const sale = Math.round(it.cost * (.5 + Math.random() * 1.4));
        money(sale); v.blackmarket.items.splice(i, 1);
        sayIt(`I sold ${it.name.toLowerCase()} for ${fmt(sale)}.`);
        notify("Sold", `${fmt(sale)} (bought for ${fmt(it.cost)}).`); vibe([20, 40, 20]); openVenture(id);
      });
    } else if (id === "zoo") {
      showScreen("YOUR ZOO", `<div class="mf-wrap"><div class="mf-lead">Buy animals; each pays a small yearly return and adds to your zoo's upkeep. Visiting your zoo lifts Happiness.</div>
        <div class="mf-card"><h4>Your animals</h4>${v.zoo.animals.length ? v.zoo.animals.map((a, i) =>
          `<div class="row"><img src="act/zoo.png" alt=""><div class="t"><b>${esc(a.name)}</b><span>${fmt(a.income)} / year</span></div></div>`).join("")
          : '<div class="mf-muted">No animals yet.</div>'}</div>
        <div class="sec">Buy an animal</div>
        ${ANIMALS.map(([n, c, inc], i) => `<div class="row" data-mf-zoo="${i}"><img src="act/zoo.png" alt=""><div class="t"><b>${esc(n)}</b><span>${fmt(c)} · earns ~${fmt(inc)} a year</span></div>${typeof DOTS !== "undefined" ? DOTS : ""}</div>`).join("")}
        <div class="mf-inline" style="margin-top:10px"><button class="mf-btn" id="mfVVisit">Visit the zoo</button><button class="mf-btn" id="mfVBack">Back</button></div></div>`, back);
      $$("[data-mf-zoo]").forEach((el) => el.onclick = () => {
        const [n, c, inc] = ANIMALS[+el.dataset.mfZoo];
        if (!canPay(c)) { notify("Your Zoo", `You need ${fmt(c)} for a ${n.toLowerCase()}.`); return; }
        money(-c); v.zoo.animals.push({ name: n, cost: c, income: inc });
        sayIt(`I bought a ${n.toLowerCase()} for my zoo.`); notify("New animal", `${n} added to your zoo.`); vibe([20, 40, 20]); openVenture(id);
      });
      const vi = $("#mfVVisit");
      if (vi) vi.onclick = () => {
        if (v.zooYear === y) { notify("Your Zoo", "You already visited this year."); return; }
        v.zooYear = y;
        try { state.stats.Happiness = clamp100(num(state.stats && state.stats.Happiness) + rnd(4, 10)); render(); } catch (e) {}
        sayIt("I spent the day walking around my zoo."); notify("A good day", "Happiness went up."); vibe(15); openVenture(id);
      };
    }
    const bk = $("#mfVBack"); if (bk) bk.onclick = () => { play("choice"); back(); };
  }

  function yearlyTick() {
    try {
      const v = ventures(), y = year();
      if (v.casino.owned && v.casinoYear !== y) {
        v.casinoYear = y;
        const profit = Math.round(v.casino.invested * (.06 + Math.random() * .10));
        money(profit); sayIt(`My casino made ${fmt(profit)} this year.`);
      }
      if (v.zoo.animals.length && v.zooYear !== y) {
        v.zooYear = y;
        const inc = v.zoo.animals.reduce((s, a) => s + Math.round(num(a.income) * (.8 + Math.random() * .4)), 0);
        const upkeep = Math.round(v.zoo.animals.length * 800);
        const net = inc - upkeep;
        money(net);
        sayIt(net >= 0 ? `My zoo earned ${fmt(net)} after upkeep.` : `My zoo cost me ${fmt(-net)} in upkeep.`);
      }
      // Landlord rent is collected manually in its own screen (once a year).
      // Channels pay out automatically.
      const ch = cfg.channels || {};
      for (const k of Object.keys(ch)) {
        const c = ch[k];
        if (!c || !c.subs) continue;
        const inc = Math.round(num(c.subs) * .05);
        if (inc > 0) { money(inc); sayIt(`My ${c.name} channel earned ${fmt(inc)} this year.`); }
      }
      applyTeamOverrides();
      checkChallenges(true);
    } catch (e) {}
  }

  /* ------------------------------------------------------------------ *
   * 15. Community rows
   * ------------------------------------------------------------------ */
  const COMMUNITY = {
    "social-instagram": ["Instagram", "@BitLifeApp", "https://www.instagram.com/bitlifeapp/"],
    "social-snapchat": ["Snapchat", "BitLifeApp", "https://www.snapchat.com/add/bitlifeapp"],
    "social-tiktok": ["TikTok", "@BitLifeApp", "https://www.tiktok.com/@bitlifeapp"],
    "social-twitter": ["Twitter / X", "@BitLifeApp", "https://x.com/BitLifeApp"],
    "social-youtube": ["YouTube", "/BitLifeApp", "https://www.youtube.com/@BitLifeApp"],
  };
  function openSocialHandle(key) {
    const [name, handle, url] = COMMUNITY[key] || ["Community", "", ""];
    showScreen(name.toUpperCase(), `<div class="mf-wrap">
      <div class="mf-lead">The official ${esc(name)} account for the game. Copy the handle or open it in a new tab.</div>
      <div class="mf-card"><h4>${esc(handle)}</h4><div class="mf-muted">${esc(name)}</div>
        <div class="mf-inline" style="margin-top:10px"><button class="mf-btn" id="mfCmCopy">Copy handle</button>
        <button class="mf-btn" id="mfCmOpen">Open ${esc(name)}</button></div></div>
      <div class="sec">In-game</div>
      ${row(ico("star"), "Post about this life", "Adds a line to your life story", 'data-mf-cm="post"')}
      ${row(ico("heart"), "Tell a friend", "Share the game with someone", 'data-mf-cm="share"')}
    </div>`, openCommunitySafe);
    const c = $("#mfCmCopy"); if (c) c.onclick = () => copyText(handle, `${handle} copied.`);
    const o = $("#mfCmOpen"); if (o) o.onclick = () => { try { window.open(url, "_blank", "noopener"); } catch (e) {} };
    $$("[data-mf-cm]").forEach((el) => el.onclick = () => {
      if (el.dataset.mfCm === "post") {
        sayIt(`I posted about my life on ${name}.`);
        notify("Posted", `A line about today was added to your life story.`); vibe(12);
      } else shareGame();
    });
  }
  function shareGame() {
    const text = "I'm playing Free Life — a life simulator. Come make a life of your own!";
    try {
      if (navigator.share) { navigator.share({ title: "Free Life", text }).catch(() => {}); return; }
    } catch (e) {}
    copyText(text, "Share text copied — paste it anywhere you like.");
  }
  function openCommunitySafe() {
    try { if (typeof openCommunity === "function") { openCommunity(openMainMenu); return; } } catch (e) {}
    openMainMenu();
  }
  function enhanceCommunity() {
    const rows = $$("[data-cm]", sList);
    let helpIdx = 0;
    rows.forEach((el) => {
      const img = el.querySelector("img");
      const src = img ? String(img.getAttribute("src") || "") : "";
      const key = src.replace(/^.*\//, "").replace(/\.png$/, "");
      if (COMMUNITY[key]) { el.onclick = () => { play("choice"); openSocialHandle(key); }; return; }
      if (key === "help-center") {
        const i = helpIdx++;
        el.onclick = () => {
          play("choice");
          if (i === 0) openHelp();
          else openAccountDeletion();
        };
        return;
      }
      el.onclick = () => { play("choice"); shareGame(); };
    });
  }
  function openAccountDeletion() {
    showScreen("MY ACCOUNT", `<div class="mf-wrap">
      <div class="mf-lead">Account and local data options. Nothing is deleted without a confirmation, and your saved lives are never touched by this screen.</div>
      <div class="sec">Account</div>
      ${row(ico("people"), "Open My Account", "The in-game account screen", 'data-mf-acct="open"')}
      ${row(ico("globe"), "Restore Earlier Purchase", "Bring back collected packs and mods", 'data-mf-acct="restore"')}
      <div class="sec">Local data</div>
      ${row(ico("floppy"), "Clear account sign-in only", "Leaves purchases, mods and lives intact", 'data-mf-acct="signout"')}
      <div class="mf-sub">There is no server-side account deletion in an offline build, so this screen manages the data that actually lives in your browser.</div>
    </div>`, openCommunitySafe);
    const acts = {
      open: () => { try { if (window.blAccount && blAccount.open) blAccount.open(); else notify("My Account", "No account is signed in on this device."); } catch (e) {} },
      restore: openRestore,
      signout: () => {
        if (typeof iosConfirm === "function") {
          iosConfirm("Clear sign-in", "Remove the local account sign-in? Your purchases, mods, themes and saved lives stay exactly as they are.", () => {
            try { localStorage.removeItem("bitlifepp-account"); } catch (e) {}
            notify("Sign-in cleared", "Local sign-in removed. Everything else is untouched.");
          });
        } else notify("Clear sign-in", "Confirmation isn't available right now, so nothing was changed.");
      },
    };
    $$("[data-mf-acct]").forEach((el) => el.onclick = () => { play("choice"); (acts[el.dataset.mfAcct] || openAccountDeletion)(); });
  }

  /* ------------------------------------------------------------------ *
   * 16. Extra social channels (podcast / onlyfans / soundcloud)
   * ------------------------------------------------------------------ */
  const CHANNELS = {
    podcast: ["Podcast", "social/podcast.png", ["Interview", "True story", "Deep dive", "Rant"]],
    onlyfans: ["OnlyFans", "social/onlyfans.png", ["Photo set", "Video", "Livestream"]],
    soundcloud: ["SoundCloud", "social/soundcloud.png", ["Demo track", "Remix", "Live set", "Mixtape"]],
  };
  function openChannel(kind) {
    const [name, icon, formats] = CHANNELS[kind] || CHANNELS.podcast;
    if (!cfg.channels) cfg.channels = {};
    const c = cfg.channels[kind] || (cfg.channels[kind] = { name, subs: 0, views: 0, posts: 0, year: -1 });
    const L = life();
    showScreen(name.toUpperCase(), `<div class="mf-wrap">
      <div class="mf-lead">Run your ${esc(name)} channel. Post once a year to grow your audience; subscribers pay out automatically every year at 5¢ each.</div>
      <div class="mf-card"><h4>${c.subs ? "Your channel" : "Not started yet"}</h4>
        <table class="mf-table">
          <tr><td>Subscribers</td><td>${num(c.subs).toLocaleString("en-US")}</td></tr>
          <tr><td>Total views</td><td>${num(c.views).toLocaleString("en-US")}</td></tr>
          <tr><td>Posts</td><td>${num(c.posts)}</td></tr>
          <tr><td>Yearly income</td><td>${fmt(Math.round(num(c.subs) * .05))}</td></tr>
        </table>
        <div class="mf-inline">${c.subs ? "" : `<button class="mf-btn" id="mfChStart">Start ${esc(name)} (free)</button>`}
          <button class="mf-btn" id="mfChBack">Back</button></div></div>
      ${c.subs ? `<div class="sec">Post this year</div>${formats.map((f, i) => row(icon, f, "Grow subscribers and views", `data-mf-post="${i}"`)).join("")}` : ""}
    </div>`, () => { try { if (typeof openSocial === "function") openSocial(openActivities, "social"); else openActivities(); } catch (e) { openMainMenu(); } });
    const s = $("#mfChStart");
    if (s) s.onclick = () => {
      c.subs = rnd(40, 300); c.views = rnd(200, 2000); c.posts = 0; save();
      sayIt(`I started a ${name} channel.`); notify("Channel started", `${c.subs} people subscribed right away.`);
      vibe([20, 40, 20]); openChannel(kind);
    };
    $$("[data-mf-post]").forEach((el) => el.onclick = () => {
      const L2 = life();
      if (c.year === year()) { notify(name, "You've already posted this year. Age up and come back."); return; }
      c.year = year();
      const f = formats[+el.dataset.mfPost];
      const gained = rnd(20, 180), views = rnd(200, 5000);
      c.subs += gained; c.views += views; c.posts++; save();
      sayIt(`I posted ${f.toLowerCase()} on ${name} and gained ${gained} subscribers.`);
      notify("Posted!", `+${gained} subscribers, ${views.toLocaleString("en-US")} views.`);
      vibe([20, 40, 20]); openChannel(kind);
    });
    const b = $("#mfChBack"); if (b) b.onclick = () => { play("choice"); try { if (typeof openSocial === "function") openSocial(openActivities, "social"); else openActivities(); } catch (e) { openMainMenu(); } };
  }

  /* ------------------------------------------------------------------ *
   * 17. Missing Activities: Adoption / Sweepstakes / Zoo
   * ------------------------------------------------------------------ */
  function surname() {
    try { if (typeof SURNAME !== "undefined" && SURNAME) return SURNAME; } catch (e) {}
    try { return state.last || "Smith"; } catch (e) { return "Smith"; }
  }
  function newChild(g, extra) {
    return Object.assign({
      kind: "child", g, first: pick(FIRST_NAMES[g]), last: surname(),
      ageOffset: -age(), look: fallbackLook(g), rel: rnd(85, 100),
      smarts: rnd(10, 100), looks: rnd(10, 100), announced: true, mfKeep: true,
    }, extra || {});
  }
  function addChild(g, label) {
    try {
      if (!Array.isArray(state.family)) state.family = [];
      const c = newChild(g);
      state.family.push(c);
      play("baby");
      sayIt(`I ${label} a baby ${g === "f" ? "girl" : "boy"} named ${c.first} ${c.last}.`);
      notify("A new child", `${c.first} ${c.last} is now in your family.`, null);
      vibe([30, 60, 30, 60]);
      render();
      return c;
    } catch (e) { notify("Family", "Couldn't add the child to this life."); return null; }
  }
  function openAdoption() {
    const cost = 25000, L = life();
    if (age() < 18) { notify("Adoption", "You must be at least 18 to adopt."); return; }
    if (L.adoptYear === year()) { notify("Adoption", "One adoption a year — age up and come back."); return; }
    if (!canPay(cost)) { notify("Adoption", `Adoption costs ${fmt(cost)}. You have ${fmt(num(state.money))}.`); return; }
    showScreen("ADOPTION", `<div class="mf-wrap">
      <div class="mf-lead">Adoption costs ${fmt(cost)} and adds a real child to your family — they appear in Relationships, grow up with you and count toward family achievements.</div>
      <div class="mf-card"><h4>Choose</h4>
        <div class="mf-inline"><button class="mf-btn" data-mf-adopt="f">Adopt a baby girl</button>
        <button class="mf-btn" data-mf-adopt="m">Adopt a baby boy</button>
        <button class="mf-btn" id="mfAdoptBack">Not now</button></div></div>
      <div class="mf-sub">The child's name and looks are generated by the game, just like any other birth.</div>
    </div>`, () => { try { openActivities(); } catch (e) {} });
    $$("[data-mf-adopt]").forEach((b) => b.onclick = () => {
      money(-cost); L.adoptYear = year();
      addChild(b.dataset.mfAdopt, "adopted");
      setTimeout(() => { try { openActivities(); } catch (e) {} }, 250);
    });
    const bk = $("#mfAdoptBack"); if (bk) bk.onclick = () => { play("choice"); try { openActivities(); } catch (e) {} };
  }
  function openSweepstakes() {
    const L = life(), cost = 100;
    if (L.sweepYear === year()) { notify("Sweepstakes", "You've already entered this year. Age up and try again."); return; }
    showScreen("SWEEPSTAKES", `<div class="mf-wrap">
      <div class="mf-lead">A ${fmt(cost)} ticket, ten numbers, one draw. Match it and win ${fmt(10000)}; otherwise you get a ${fmt(20)} consolation.</div>
      <div class="mf-card"><h4>Pick a number</h4>
        <div class="mf-grid" id="mfSweepGrid">${Array.from({ length: 10 }, (_, i) => `<div class="mf-tile" data-mf-sweep="${i + 1}">${i + 1}</div>`).join("")}</div>
        <div class="mf-big" id="mfSweepOut"></div></div>
      <div class="mf-inline"><button class="mf-btn" id="mfSweepBack">Back</button></div></div>`, () => { try { openActivities(); } catch (e) {} });
    $$("[data-mf-sweep]").forEach((t) => t.onclick = () => {
      if (L.sweepYear === year()) { notify("Sweepstakes", "One entry a year."); return; }
      if (!canPay(cost)) { notify("Sweepstakes", `You need ${fmt(cost)} for a ticket.`); return; }
      L.sweepYear = year(); money(-cost);
      const chosen = +t.dataset.mfSweep, draw = rnd(1, 10), win = chosen === draw, prize = win ? 10000 : 20;
      money(prize);
      const out = $("#mfSweepOut");
      if (out) out.innerHTML = win ? `<span style="color:#43c46b">It was ${draw}! You won ${fmt(prize)}!</span>` : `<span class="mf-muted">It was ${draw}. Consolation ${fmt(prize)}.</span>`;
      sayIt(win ? `I won ${fmt(prize)} in a sweepstakes.` : "I entered a sweepstakes and didn't win.");
      $$("[data-mf-sweep]").forEach((x) => x.classList.add("done"));
      vibe(win ? [20, 40, 20, 40] : 12);
      render();
    });
    const bk = $("#mfSweepBack"); if (bk) bk.onclick = () => { play("choice"); try { openActivities(); } catch (e) {} };
  }
  function openZoo() {
    const L = life(), cost = 60;
    if (L.zooYear === year()) { notify("Zoo Trip", "You've already been this year."); return; }
    if (!canPay(cost)) { notify("Zoo Trip", `A ticket is ${fmt(cost)}.`); return; }
    L.zooYear = year(); money(-cost);
    try { state.stats.Happiness = clamp100(num(state.stats && state.stats.Happiness) + rnd(5, 12)); render(); } catch (e) {}
    const sightings = ["a red panda curled up in a tree", "the lions being fed", "a penguin waddling right up to the glass", "a keeper talk about snow leopards", "the elephants splashing in their pool", "a parrot that said hello back"];
    const s = pick(sightings);
    sayIt(`I went to the zoo and saw ${s}.`);
    notify("Zoo Trip", `You saw ${s}. Happiness went up.`, null);
    vibe(15);
  }

  /* ------------------------------------------------------------------ *
   * 18. Fertility / Crime / Love / Garage / Marketplace stubs
   * ------------------------------------------------------------------ */
  function fertilityAction(kind) {
    const L = life(), y = year();
    if (age() < 18) { notify("Fertility", "You must be 18 or older."); return; }
    if (kind === "donate") {
      if (L.donateYear === y) { notify("Fertility", "You've already donated this year."); return; }
      L.donateYear = y; const pay = 1500;
      money(pay); sayIt(`I donated ${"f" === (() => { try { return state.gender; } catch (e) { return "m"; } })() ? "eggs" : "sperm"} and was paid ${fmt(pay)}.`);
      notify("Donation complete", `${fmt(pay)} was added to your balance.`); vibe([20, 40, 20]);
    } else if (kind === "ivf") {
      const cost = 12000;
      if (L.sterilized) { notify("IVF", "You had a sterilization procedure. Reverse it first if you want to try IVF."); return; }
      if (!canPay(cost)) { notify("IVF", `IVF costs ${fmt(cost)}. You have ${fmt(num(state.money))}.`); return; }
      money(-cost);
      if (Math.random() < .6) {
        addChild(pick(["m", "f"]), "welcomed through IVF");
        notify("It worked", "IVF was successful — a baby is on the way.");
      } else {
        sayIt("I tried IVF, but it didn't work this time.");
        notify("Not this time", "The IVF cycle wasn't successful. You can try again.");
      }
    } else if (kind === "sterilize") {
      const L2 = life();
      if (L2.sterilized) {
        if (!canPay(6000)) { notify("Reversal", "Reversal costs $6,000."); return; }
        money(-6000); L2.sterilized = false;
        sayIt("I had my sterilization reversed.");
        notify("Reversed", "The procedure has been reversed.");
      } else {
        if (!canPay(3000)) { notify("Sterilization", "The procedure costs $3,000."); return; }
        money(-3000); L2.sterilized = true;
        sayIt("I got sterilized.");
        notify("Procedure recorded", "Saved with this life. It blocks IVF here and can be reversed for $6,000. Other pregnancy systems in the game are unchanged.");
      }
      vibe(15);
    }
  }
  function crimeTrain() {
    const L = life(), y = year();
    if (L.trainYear === y) { notify("Train Robbery", "One job a year. Lay low until next year."); return; }
    L.trainYear = y;
    const win = Math.random() < .55, take = win ? rnd(2500, 9000) : 0;
    if (win) money(take);
    else { try { state.stats.Happiness = clamp100(num(state.stats.Happiness) - 5); render(); } catch (e) {} }
    sayIt(win ? `I robbed a train and got away with ${fmt(take)}.` : "I tried to rob a train and came away with nothing.");
    notify(win ? "Clean getaway" : "Nothing doing", win ? `${fmt(take)} added to your balance.` : "The crew got away before you did. Happiness -5.");
    vibe(win ? [20, 40, 20] : 12);
  }
  function loveBride() {
    const L = life(), cost = 8000;
    if (age() < 18) { notify("Mail-Order Bride", "You must be 18 or older."); return; }
    if (!canPay(cost)) { notify("Mail-Order Bride", `The agency fee is ${fmt(cost)}.`); return; }
    money(-cost);
    try {
      if (!Array.isArray(state.lovers)) state.lovers = [];
      const g = "f";
      const p = { first: pick(FIRST_NAMES.f), last: pick(LAST_NAMES), g,
        look: fallbackLook(g), ageOffset: rnd(-5, 3), rel: 60, since: age(), main: false, intimate: false };
      state.lovers.push(p);
      sayIt(`I arranged to meet ${p.first} ${p.last} through a marriage agency.`);
      notify("A new relationship", `${p.first} ${p.last} is now in your Relationships. Get to know her in Love → Spend Time.`);
      vibe([20, 40, 20]);
    } catch (e) { notify("Mail-Order Bride", "Couldn't add the relationship to this life."); }
  }
  function openGarage() {
    let cars = [];
    try { cars = state.cars || []; } catch (e) {}
    const total = cars.reduce((s, c) => s + num(c.price), 0);
    showScreen("GARAGE", `<div class="mf-wrap">
      <div class="mf-lead">Every vehicle you own, in one place. Values are what the game uses for net worth; condition affects resale.</div>
      <div class="mf-card"><h4>At a glance</h4><div class="mf-inline"><span class="mf-big">${cars.length}</span><span class="mf-muted">vehicles</span>
        <span class="mf-muted" style="margin-left:auto">${fmt(total)} total</span></div></div>
      <div class="sec">Vehicles</div>
      ${cars.length ? cars.map((c, i) => `<div class="row"><img src="${esc((typeof carImg === "function" ? carImg(c) : "cars/suv-red.png"))}" alt=""><div class="t"><b>${esc((typeof carName === "function" ? carName(c) : "Vehicle " + (i + 1)))}</b><span>${fmt(num(c.price))} · condition ${num(c.cond)}%</span></div></div>`).join("")
        : '<div class="mf-lead">Your garage is empty. Buy a car in Assets → Shopping.</div>'}
      <div class="mf-inline"><button class="mf-btn" id="mfGarageBack">Back</button></div>
    </div>`, () => { try { openAssets(); } catch (e) { openMainMenu(); } });
    const b = $("#mfGarageBack"); if (b) b.onclick = () => { play("choice"); try { openAssets(); } catch (e) { openMainMenu(); } };
  }

  /* ------------------------------------------------------------------ *
   * 19. Screen enhancement dispatcher
   * ------------------------------------------------------------------ */
  function titleKey() {
    try {
      if (sTitle && sTitle.dataset && sTitle.dataset.mfKey) return sTitle.dataset.mfKey;
      return sTitle ? String(sTitle.textContent || "").trim() : "";
    } catch (e) { return ""; }
  }
  function enhanceSettings() {
    const rows = $$("[data-st]", sList);
    rows.forEach((el) => {
      const k = el.dataset.st;
      if (!["accessibility", "challenges", "halfYear", "haptics", "minigames", "languages"].includes(k)) return;
      setBoxVisual(el, k === "minigames" ? true : k === "languages" ? cfg.language !== "en" : !!cfg[k]);
      el.onclick = () => {
        play("choice");
        if (["accessibility", "challenges", "halfYear", "haptics"].includes(k)) {
          cfg[k] = !cfg[k]; save(); setBoxVisual(el, !!cfg[k]);
          if (k === "accessibility" && cfg[k] && voiceOK()) speak("Voice navigation on");
        }
        openFeature(k);
      };
    });
    const restore = document.getElementById("setRestore");
    if (restore) restore.onclick = () => { play("choice"); openRestore(); };
  }
  function challengeBanner() {
    if (!cfg.challenges) return "";
    rollChallenges(false);
    return `<div id="mfChallengeBar" class="mf-chipbar"></div>`;
  }
  function enhanceMainMenu() {
    const map = {
      stuff: openMyStuff, ach: openAchievements,
      cemetery: () => { try { if (window.CEMETERY && CEMETERY.openCemetery) { CEMETERY.openCemetery(); return; } } catch (e) {} openMyStuff(); },
      cities: openCustomCities, people: openCustomPeople, sports: openSportsTeams,
      fav: openFavoriteActivities, help: openHelp, jobpacks: openJobPacks,
      expansion: () => openExpansionPacks(), redeem: () => {
        try { if (window.BL_MODS && BL_MODS.portCard) { BL_MODS.portCard(); return; } } catch (e) {}
        openRestore();
      },
    };
    $$("[data-mm]", sList).forEach((el) => {
      const k = el.dataset.mm, fn = map[k];
      if (!fn) return;
      el.classList.remove("dis");
      el.onclick = () => { play("choice"); fn(); };
    });
    // A single entry point for everything, present in every theme (the
    // classic menu hides several rows in Free Life / 2018 layouts).
    if (!$("[data-mf-all]", sList)) {
      const all = document.createElement("div");
      all.innerHTML = row(ico("star"), "All Features", "Everything that used to say Error", 'data-mf-all="1"');
      const node = all.firstElementChild;
      if (node) {
        sList.insertBefore(node, sList.firstChild);
        node.onclick = () => { play("choice"); openAllFeatures(); };
      }
    }
    if (cfg.challenges && !document.getElementById("mfChallengeBar")) {
      const b = document.createElement("div");
      b.innerHTML = challengeBanner();
      const node = b.firstElementChild;
      if (node) sList.insertBefore(node, sList.firstChild);
    }
    updateChallengeChip();
  }
  function openAllFeatures() {
    const items = [
      ["gear", "Settings", openSettingsScreen], ["access", "Accessibility", openAccessibility],
      ["challenge", "Challenges", openChallenges], ["half", "Half-Year Age Up", openHalfYear],
      ["haptic", "Haptics", openHaptics], ["game", "Mini-Games / Arcade", openArcade],
      ["globe", "Languages", openLanguages], ["bag", "My Stuff", openMyStuff],
      ["trophy", "Achievements", openAchievements], ["skull", "Cemetery", () => { try { window.CEMETERY && CEMETERY.openCemetery && CEMETERY.openCemetery(); } catch (e) {} }],
      ["city", "Custom Cities", openCustomCities], ["people", "Custom People", openCustomPeople],
      ["sports", "Edit Sports Teams", openSportsTeams], ["heart", "Favorite Activities", openFavoriteActivities],
      ["help", "Help & Feedback", () => openHelp()], ["pack", "Job Packs", openJobPacks],
      ["capitol", "Political Career", () => window.POLITICS && POLITICS.openPolitics()],
      ["bag", "Expansion Packs", () => openExpansionPacks()], ["floppy", "Restore Purchases", openRestore],
      ["cart", "Marketplace", () => { try { openMarketplace(); } catch (e) {} }],
    ];
    showScreen("ALL FEATURES", `<div class="mf-wrap">
      <div class="mf-lead">Every feature that previously opened an "Error" popup, now in one place. All of them work offline.</div>
      <div class="sec">Features</div>
      ${items.map(([ic, name], i) => row(ico(ic), name, "Tap to open", `data-mf-allitem="${i}"`)).join("")}
    </div>`, openMainMenu);
    $$("[data-mf-allitem]").forEach((el) => el.onclick = () => { play("choice"); (items[+el.dataset.mfAllitem] || [])[2](); });
  }
  function enhanceActivities() {
    const missing = { adoption: openAdoption, sweepstakes: openSweepstakes, zoo: openZoo };
    $$("[data-act]", sList).forEach((el) => {
      const k = el.dataset.act, fn = missing[k];
      if (fn) el.onclick = () => { play("choice"); fn(); };
    });
    if (cfg.favorites.length && !$("[data-mf-favrow]", sList)) {
      const favHtml = `<div class="sec">Favorites</div>` + cfg.favorites.map((k) =>
        row("act/" + (ACTIVITY_LIST.find(([id]) => id === k) || [k, k, k])[2] + ".png",
          ACT_NAME[k] || k, "Pinned activity", `data-mf-favrow="${esc(k)}"`)).join("");
      sList.insertAdjacentHTML("afterbegin", favHtml);
      $$("[data-mf-favrow]", sList).forEach((el) => el.onclick = () => { play("choice"); launchActivity(el.dataset.mfFavrow); });
    }
    if (cfg.challenges && !document.getElementById("mfChallengeBar")) {
      const b = document.createElement("div");
      b.innerHTML = challengeBanner();
      const node = b.firstElementChild;
      if (node) sList.insertBefore(node, sList.firstChild);
    }
    updateChallengeChip();
  }
  function launchActivity(k) {
    const M = {
      crime: ["openCrime"], accessories: ["openAccessories"], horse: ["openHorseRaces"],
      timemachine: ["openTimeMachine"], will: ["willCard"], licenses: ["drivingLicenseCard"],
      social: ["openSocial", "social"], salon: ["openSalon"], pets: ["openPets"], love: ["openLove"],
      doctor: ["openDoctorMenu"], nightlife: ["openNightlife"], gamble: ["openCasinoGames"],
      pray: ["prayCard"], mindbody: ["openMindBodyAct"], surgery: ["openSurgery"],
      vacation: ["openVacation"], emigrate: ["openEmigrate"], fight: ["openFightBetting"],
      identity: ["openIdentity"], lottery: ["openLottery"], rehab: ["openRehab"],
      movies: ["openMovies"], lawsuit: ["openLawsuit"], shopping: ["openShopping", "acts"],
      fertility: ["openFertility"], therapy: ["openTherapy"], hunting: ["openHunting"],
      adoption: [null, openAdoption], sweepstakes: [null, openSweepstakes], zoo: [null, openZoo],
      politics: [null, () => window.POLITICS && POLITICS.openPolitics()],
    };
    const spec = M[k];
    if (!spec) { notify(ACT_NAME[k] || "Activity", "That activity isn't available in this version."); return; }
    if (spec[1] && typeof spec[1] === "function") { spec[1](); return; }
    try {
      const fn = window[spec[0]];
      if (typeof fn !== "function") throw new Error("missing");
      if (k === "timemachine") { try { document.getElementById("screen").classList.remove("open"); } catch (e) {} }
      fn.apply(null, spec.length > 1 && typeof spec[1] === "string" ? [spec[1]] : []);
    } catch (e) {
      try { if (typeof openActivities === "function") openActivities(); } catch (e2) {}
    }
  }
  function enhancePresence() {
    // Expansion-pack placeholders in Assets / Shopping
    $$("[data-soon]", sList).forEach((el) => {
      el.classList.remove("dis");
      el.onclick = () => { play("choice"); openExpansionPacks(el.dataset.soon); };
    });
    // Special Careers pack rows
    $$("[data-pack]", sList).forEach((el) => {
      el.classList.remove("dis");
      el.onclick = () => { play("choice"); openJobPacks(); };
    });
    // Car → Garage
    $$('[data-ca="garage"]', sList).forEach((el) => el.onclick = () => { play("choice"); openGarage(); });
    // Marketplace restore
    const mr = $(".mkt-restore", sList);
    if (mr) mr.onclick = () => { play("choice"); openRestore(); };
    // Fertility
    $$("[data-fe]", sList).forEach((el) => {
      const k = el.dataset.fe;
      if (k === "surrogate") return;                 // already implemented by the game
      el.onclick = () => { play("choice"); fertilityAction(k); };
    });
    // Crime: train robbery
    $$('[data-cr="train"]', sList).forEach((el) => {
      el.classList.remove("dis");
      el.onclick = () => { play("choice"); crimeTrain(); };
    });
    // Love: mail-order bride
    $$('[data-lv="bride"]', sList).forEach((el) => {
      el.classList.remove("dis");
      el.onclick = () => { play("choice"); loveBride(); };
    });
    // Social channels
    $$("[data-soc]", sList).forEach((el) => {
      const k = el.dataset.soc;
      if (!CHANNELS[k]) return;
      el.classList.remove("dis");
      el.onclick = () => { play("choice"); openChannel(k); };
    });
  }
  function enhanceSocial() {
    if ($("[data-mf-chan]", sList)) return;
    const html = `<div class="sec">Creator Channels</div>` + Object.keys(CHANNELS).map((k) =>
      row(CHANNELS[k][1], CHANNELS[k][0], "Start a channel, post and earn", `data-mf-chan="${k}"`)).join("");
    sList.insertAdjacentHTML("afterbegin", html);
    $$("[data-mf-chan]", sList).forEach((el) => el.onclick = () => { play("choice"); openChannel(el.dataset.mfChan); });
  }
  function enhance(title) {
    try {
      switch (title) {
        case "SETTINGS": enhanceSettings(); break;
        case "MAIN MENU": enhanceMainMenu(); break;
        case "BITLIFE COMMUNITY": enhanceCommunity(); break;
        case "ACTIVITIES": enhanceActivities(); break;
        case "SOCIAL MEDIA":
        case "GAMING PLATFORMS":
        case "SUBSCRIPTIONS": enhanceSocial(); break;
      }
      enhancePresence();
    } catch (e) { if (window.console) console.warn("menu-features enhance", e); }
  }

  /* ------------------------------------------------------------------ *
   * 20. Global fallbacks: comingSoon, openPlaceholder, offline leaderboard
   * ------------------------------------------------------------------ */
  function installFallbacks() {
    // No more "Error / Error". Any un-wired shortcut now explains itself and
    // offers a working way out.
    window.comingSoon = function () {
      const t = titleKey() || "this screen";
      play("choice");
      notify("This shortcut", `Nothing is wired to this shortcut on ${t} yet. Use Main Menu → All Features to reach every working feature, or Settings for the options.`,
        () => { try { openMainMenu(); } catch (e) {} });
    };
    // A real quick menu for any stray tab.
    window.openPlaceholder = function (name) {
      showScreen("QUICK MENU", `<div class="mf-wrap">
        <div class="mf-lead">Quick menu${name ? " for " + esc(name) : ""}. Everything here works.</div>
        <div class="sec">Go to</div>
        ${row(ico("star"), "All Features", "Every fixed feature", 'data-mf-q="all"')}
        ${row(ico("gear"), "Settings", "Options and accessibility", 'data-mf-q="settings"')}
        ${row(ico("game"), "Arcade", "Mini-games and tokens", 'data-mf-q="arcade"')}
        ${row(ico("challenge"), "Challenges", "This year's goals", 'data-mf-q="challenges"')}
      </div>`, openMainMenu);
      const go = { all: openAllFeatures, settings: openSettingsScreen, arcade: openArcade, challenges: openChallenges };
      $$("[data-mf-q]").forEach((el) => el.onclick = () => { play("choice"); (go[el.dataset.mfQ] || openMainMenu)(); });
    };
    // Offline leaderboard: serve /api/leaderboard from the lives saved here.
    try {
      const origFetch = window.fetch;
      if (typeof origFetch === "function") {
        window.fetch = function (input, init) {
          try {
            const u = typeof input === "string" ? input : (input && input.url) || "";
            if (/\/api\/leaderboard/.test(u))
              return localLeaderboardRows().then((rows) => ({ ok: true, status: 200, json: async () => ({ rows }) }));
          } catch (e) {}
          return origFetch.apply(this, arguments);
        };
      }
    } catch (e) {}
  }
  function stateValue(st, path, dflt) {
    try { const v = path.reduce((o, k) => (o == null ? o : o[k]), st); return Number.isFinite(+v) ? +v : dflt; }
    catch (e) { return dflt; }
  }
  async function localLeaderboardRows() {
    let idx = [], saved = {};
    try { if (typeof livesIndex === "function") idx = livesIndex() || []; } catch (e) {}
    try {
      if (typeof dbDo === "function") {
        const all = await dbDo("readonly", (store) => store.getAll());
        if (Array.isArray(all)) for (const rec of all) if (rec && rec.id) saved[rec.id] = rec.state || {};
      }
    } catch (e) {}
    return (idx || []).filter((s) => s && s.id).map((s) => {
      const st = saved[s.id] || {};
      let worth = stateValue(st, ["money"], num(s.money));
      try {
        worth += (st.props || []).reduce((a, p) => a + Math.round(num(p.price) * (.8 + num(p.cond) / 250)), 0);
        worth += (st.cars || []).reduce((a, c) => a + num(c.price), 0);
        worth += (st.heirlooms || []).reduce((a, h) => a + num(h.value), 0);
      } catch (e) {}
      let kids = 0, lovers = 0;
      try { kids = (st.family || []).filter((f) => f.kind === "child").length; } catch (e) {}
      try { lovers = (st.lovers || []).length + (st.spouse && !st.spouse.dead ? 1 : 0); } catch (e) {}
      return {
        name: `${s.first || "Someone"} ${s.last || ""}`.trim(),
        country: s.country || "us", city: st.city || "",
        age: num(s.age), net_worth: Math.round(worth), children: kids, lovers,
      };
    });
  }

  /* ------------------------------------------------------------------ *
   * 21. Hooks & observers
   * ------------------------------------------------------------------ */
  function installHooks() {
    injectCSS();
    hookPurchaseBackup();
    backupNow();
    applyCustomCities();
    applyTeamOverrides();
    rollChallenges(false);

    // One capture-phase listener on document: haptics, tap-to-read, and the
    // half-year Age interception (document capture runs before every target
    // listener, so stopImmediatePropagation really blocks the whole year).
    document.addEventListener("click", (e) => {
      try {
        if (cfg.haptics && navigator.vibrate) navigator.vibrate(8);
      } catch (err) {}
      if (cfg.accessibility && voiceOK()) {
        try {
          const el = e.target && e.target.closest ? e.target.closest(".row, .tab, button, .mf-btn, .mf-tile") : null;
          if (el) {
            const b = el.querySelector && el.querySelector("b");
            const txt = (b && b.textContent) || el.getAttribute("aria-label") || el.textContent || "";
            const clean = String(txt).replace(/\s+/g, " ").trim().slice(0, 120);
            if (clean) speak(clean, true);
          }
        } catch (err) {}
      }
      halfYearIntercept(e);
    }, true);

    // Yearly work, after the game's own age handlers have finished.
    try {
      const ab = document.getElementById("ageBtn");
      if (ab) ab.addEventListener("click", () => {
        setTimeout(() => { try { yearlyTick(); } catch (err) {} }, 1400);
        setTimeout(() => { try { updateChallengeChip(); } catch (err) {} }, 60);
      });
    } catch (e) {}

    // Alt + R reads the current screen.
    document.addEventListener("keydown", (e) => {
      if (e.altKey && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        if (!cfg.accessibility) { notify("Voice Navigation", "Turn on Accessibility in Settings first."); return; }
        const rows = $$(".row b", sList).slice(0, 6).map((x) => x.textContent.trim());
        speak((titleKey() || "Screen") + ". " + rows.join(". "));
      }
    });

    // Enhance any screen the moment it is rendered (including screens
    // replayed by the Back fix, which bypasses our function wrappers).
    let lastTitle = "", lastFirst = null, busy = false;
    const sListObserver = new MutationObserver(() => {
      if (busy) return;
      const t = titleKey();
      const first = sList && sList.firstElementChild;
      if (t === lastTitle && first === lastFirst) return;
      busy = true;
      try {
        lastTitle = t;
        lastFirst = first;
        enhance(t);
        translateTree(sList);
      } finally {
        lastTitle = titleKey();
        lastFirst = sList && sList.firstElementChild;
        busy = false;
      }
    });
    if (sList) sListObserver.observe(sList, { childList: true, subtree: true });

    // Translate newly rendered text anywhere in the phone.
    const i18nObserver = new MutationObserver((muts) => {
      if (cfg.language === "en") return;
      for (const m of muts) {
        for (const n of m.addedNodes) { if (n.nodeType === 1) translateTree(n); else if (n.nodeType === 3 && n.parentNode) translateEl(n.parentNode); }
        if (m.type === "characterData" && m.target && m.target.parentNode) translateEl(m.target.parentNode);
      }
    });
    try { i18nObserver.observe(document.body, { childList: true, subtree: true, characterData: true }); } catch (e) {}

    // Announce screen titles (guarded against translation churn).
    let lastSpoken = "";
    const titleObserver = new MutationObserver(() => {
      if (!cfg.accessibility) return;
      const t = titleKey();
      if (!t || t === lastSpoken) return;
      lastSpoken = t;
      speakScreen(t);
    });
    try { if (sTitle) titleObserver.observe(sTitle, { childList: true, characterData: true, subtree: true }); } catch (e) {}

    // Re-apply team names when a new league is generated in a new life.
    try { setInterval(() => { applyTeamOverrides(); }, 2500); } catch (e) {}

    updateChallengeChip();
    translateAll();
    installFallbacks();
  }

  /* ------------------------------------------------------------------ *
   * 22. Public API (pure functions are exported for unit tests)
   * ------------------------------------------------------------------ */
  window.MENU_FEATURES = {
    cfg, save, life, LANGS,
    translateEl, translateAll, tr, setLanguage, langName,
    CHALLENGES, challengeProgress, rollChallenges, checkChallenges, shortNum,
    snapshotPurchases, mergeRestore, b64encode, b64decode,
    EXPANSIONS, ACTIVITY_LIST, jobPacks, ventures, yearlyTick,
    halfYearIntercept, enhance, titleKey, launchActivity,
    openArcade, openChallenges, openLanguages, openRestore, openCustomCities,
    openCustomPeople, openSportsTeams, openFavoriteActivities, openMyStuff,
    openAchievements, openHelp, openJobPacks, openExpansionPacks, openAllFeatures,
    applyCustomCities, applyTeamOverrides, localLeaderboardRows,
    installHooks,
  };

  // DOM is ready (this script sits at the end of <body>), so install now.
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", installHooks);
  else installHooks();
})();
