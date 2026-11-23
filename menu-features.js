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
    help: "menu/help-center.png", pack: "emoji/1f4bc.png",
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
      "Custom Cities":"Ciudades personalizadas","Custom People":"Personas personalizadas",
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
   * 8. Arcade — six real, playable mini-games
   * ------------------------------------------------------------------ */
  const SYMBOLS = ["🍒", "🍋", "🍊", "⭐", "💎", "7️⃣"];
  function addTokens(n) { cfg.tokens = Math.max(0, num(cfg.tokens) + n); save(); }
  function best(key, val) { if (val > num(cfg.best[key])) { cfg.best[key] = val; save(); return true; } return false; }
  function arcadeHead(title) {
    return `<div class="mf-wrap"><div class="mf-card"><div class="mf-inline">
      <span class="mf-big" id="mfTokens">${num(cfg.tokens).toLocaleString("en-US")}</span><span class="mf-muted">tokens</span>
      <span class="mf-muted" style="margin-left:auto">${num(cfg.plays)} plays</span></div></div>`;
  }
  function cashOut() {
    const L = life();
    if (L.cashYear === year()) { notify("Arcade", "You've already cashed out tokens this year. Age up and come back."); return; }
    if (num(cfg.tokens) < 10) { notify("Arcade", "You need at least 10 tokens to cash out."); return; }
    const rate = 10, amount = num(cfg.tokens) * rate;
    cfg.tokens = 0; L.cashYear = year(); save();
    money(amount);
    sayIt(`I cashed in my arcade tokens for ${fmt(amount)}.`);
    vibe([20, 40, 20]);
    notify("Cashed out!", `${fmt(amount)} was added to your bank balance. (10 tokens = $10, once per year)`);
    openArcade();
  }
  function openArcade() {
    const games = [
      ["coin", "🪙", "Coin Flip", "Call heads or tails. Win 12 tokens."],
      ["higher", "🔢", "Higher or Lower", "Guess the next card. Build a streak."],
      ["memory", "🧠", "Memory Match", "Find all 8 pairs. Fewer moves = more tokens."],
      ["slots", "🎰", "Lucky Slots", "Spin 3 reels. 5 tokens a spin."],
      ["reaction", "⚡", "Reaction Test", "Tap the moment it turns green."],
      ["rps", "✊", "Rock Paper Scissors", "First to 3 wins takes 40 tokens."],
    ];
    showScreen("ARCADE", arcadeHead("Arcade") + `
      <div class="mf-lead">Win tokens, then cash them out for real in-game money. Every game saves its best score.</div>
      <div class="sec">Games</div>
      ${games.map(([k, e, t, d]) => row("", t, `${e} ${d}`, `data-mf-game="${k}"`)).join("")}
      <div class="sec">Tokens</div>
      ${row(ico("coin"), "Cash out", "10 tokens = $10, once per game year", 'data-mf-game="cash"')}
      <div class="mf-card"><h4>Best scores</h4><table class="mf-table">
        ${games.map(([k, , t]) => `<tr><td>${esc(t)}</td><td>${cfg.best[k] ? esc(cfg.best[k]) : "—"}</td></tr>`).join("")}
      </table></div>
    </div>`, openSettingsScreen);
    $$("[data-mf-game]").forEach((el) => el.onclick = () => {
      play("choice"); const g = el.dataset.mfGame;
      ({ coin: gameCoin, higher: gameHigher, memory: gameMemory, slots: gameSlots,
         reaction: gameReaction, rps: gameRPS, cash: cashOut }[g] || openArcade)();
    });
  }
  function gameCoin() {
    showScreen("COIN FLIP", arcadeHead("Coin Flip") + `<div class="mf-card">
      <h4>Call it</h4><div class="mf-lead">Heads or tails? A correct call wins 12 tokens.</div>
      <div class="mf-reels"><div class="mf-reel" id="mfCoin">🪙</div></div>
      <div class="mf-inline"><button class="mf-btn" data-mf-call="h">Heads</button><button class="mf-btn" data-mf-call="t">Tails</button></div>
      <div class="mf-big" id="mfCoinOut"></div></div>
      <div class="mf-inline"><button class="mf-btn" id="mfCoinBack">Back to Arcade</button></div></div>`, openArcade);
    $$("[data-mf-call]").forEach((b) => b.onclick = () => {
      const call = b.dataset.mfCall, res = Math.random() < .5 ? "h" : "t";
      const el = $("#mfCoin"); if (el) el.textContent = res === "h" ? "🙂" : "🦅";
      const out = $("#mfCoinOut");
      cfg.plays++; const win = call === res;
      if (win) { addTokens(12); const streak = num(cfg.best.coin) + 1; best("coin", streak); }
      else { cfg.best.coin = 0; }
      save();
      if (out) out.innerHTML = win ? `<span style="color:#43c46b">Correct! +12 tokens · streak ${cfg.best.coin}</span>` : `<span style="color:#e04343">Wrong! It was ${res === "h" ? "heads" : "tails"}. Streak reset.</span>`;
      vibe(win ? [20, 40, 20] : 12);
      const t = $("#mfTokens"); if (t) t.textContent = num(cfg.tokens).toLocaleString("en-US");
      $$("[data-mf-call]").forEach((x) => x.disabled = false);
      render();
    });
    const b = $("#mfCoinBack"); if (b) b.onclick = () => { play("choice"); openArcade(); };
  }
  function gameHigher() {
    const L = life(); L.hl = L.hl || { cur: rnd(1, 13), streak: 0 };
    const st = L.hl;
    showScreen("HIGHER OR LOWER", arcadeHead("Higher or Lower") + `<div class="mf-card">
      <h4>Current card</h4><div class="mf-reels"><div class="mf-reel" id="mfHL">${st.cur}</div></div>
      <div class="mf-lead">Is the next card higher or lower? Each correct guess adds 8 tokens to the pot.</div>
      <div class="mf-inline"><button class="mf-btn" data-mf-hl="up">Higher ▲</button><button class="mf-btn" data-mf-hl="down">Lower ▼</button>
        <button class="mf-btn" data-mf-hl="stop">Take the pot (${num(st.streak) * 8})</button></div>
      <div class="mf-big" id="mfHLOut"></div></div>
      <div class="mf-inline"><button class="mf-btn" id="mfHLBack">Back to Arcade</button></div></div>`, openArcade);
    $$("[data-mf-hl]").forEach((b) => b.onclick = () => {
      const g = b.dataset.mfHl, out = $("#mfHLOut");
      if (g === "stop") {
        const win = num(st.streak) * 8; addTokens(win); cfg.plays++;
        best("higher", num(st.streak)); st.streak = 0; st.cur = rnd(1, 13); save();
        if (out) out.innerHTML = `<span style="color:#43c46b">You banked ${win} tokens.</span>`;
        $$("[data-mf-hl]").forEach((x) => { if (x.dataset.mfHl !== "stop") x.disabled = true; });
        const t = $("#mfTokens"); if (t) t.textContent = num(cfg.tokens).toLocaleString("en-US");
        render(); return;
      }
      const next = rnd(1, 13);
      const correct = g === "up" ? next >= st.cur : next <= st.cur;
      // equal counts as a push, not a loss
      cfg.plays++; save();
      const reel = $("#mfHL"); if (reel) reel.textContent = next;
      if (correct) {
        st.streak++; st.cur = next; best("higher", num(st.streak));
        if (out) out.innerHTML = `<span style="color:#43c46b">${next}! Correct — streak ${st.streak} (+8 in the pot)</span>`;
        vibe(10);
      } else {
        if (out) out.innerHTML = `<span style="color:#e04343">${next}! Wrong. Pot lost, streak resets.</span>`;
        st.streak = 0; st.cur = rnd(1, 13); vibe([25, 30]);
      }
      save();
      const stop = $('[data-mf-hl="stop"]'); if (stop) stop.textContent = `Take the pot (${num(st.streak) * 8})`;
    });
    const b = $("#mfHLBack"); if (b) b.onclick = () => { play("choice"); openArcade(); };
  }
  function gameMemory() {
    const L = life();
    const deck = ["🍎","🍋","🍇","🍒","🥑","🍉","🍑","🥝"];
    const cards = deck.concat(deck).sort(() => Math.random() - .5);
    L.mem = { cards, flipped: [], matched: [], moves: 0, lock: false };
    drawMemory();
  }
  function drawMemory() {
    const L = life(), m = L.mem;
    const tiles = m.cards.map((c, i) => {
      const shown = m.flipped.includes(i) || m.matched.includes(i);
      return `<div class="mf-tile ${m.matched.includes(i) ? "done" : shown ? "flip" : ""}" data-mf-mem="${i}">${shown ? c : "❔"}</div>`;
    }).join("");
    showScreen("MEMORY MATCH", arcadeHead("Memory Match") + `<div class="mf-card">
      <h4>Find the 8 pairs</h4><div class="mf-lead">Moves: <b id="mfMemMoves">${m.moves}</b> · fewer moves = more tokens.</div>
      <div class="mf-grid" id="mfMemGrid">${tiles}</div>
      <div class="mf-big" id="mfMemOut"></div></div>
      <div class="mf-inline"><button class="mf-btn" id="mfMemNew">New board</button><button class="mf-btn" id="mfMemBack">Back to Arcade</button></div></div>`, openArcade);
    $$("[data-mf-mem]").forEach((t) => t.onclick = () => memFlip(+t.dataset.mfMem));
    const n = $("#mfMemNew"); if (n) n.onclick = () => { play("choice"); gameMemory(); };
    const b = $("#mfMemBack"); if (b) b.onclick = () => { play("choice"); openArcade(); };
  }
  function memFlip(i) {
    const L = life(), m = L.mem;
    if (m.lock || m.flipped.includes(i) || m.matched.includes(i)) return;
    m.flipped.push(i);
    if (m.flipped.length === 2) {
      m.moves++; m.lock = true;
      const [a, b] = m.flipped;
      if (m.cards[a] === m.cards[b]) {
        m.matched.push(a, b); m.flipped = []; m.lock = false;
        if (m.matched.length === m.cards.length) {
          const reward = Math.max(5, 50 - m.moves);
          addTokens(reward); cfg.plays++;
          const score = Math.max(0, 100 - m.moves);
          best("memory", score); save();
          const out = $("#mfMemOut");
          if (out) out.innerHTML = `<span style="color:#43c46b">All pairs! +${reward} tokens in ${m.moves} moves.</span>`;
          vibe([20, 40, 20, 40]); render();
          drawMemory(); return;
        }
      } else {
        setTimeout(() => { m.flipped = []; m.lock = false; drawMemory(); }, 650);
      }
    }
    drawMemory();
    const mv = $("#mfMemMoves"); if (mv) mv.textContent = m.moves;
  }
  function gameSlots() {
    showScreen("LUCKY SLOTS", arcadeHead("Lucky Slots") + `<div class="mf-card">
      <h4>5 tokens a spin</h4><div class="mf-reels" id="mfReels">
        <div class="mf-reel">🍒</div><div class="mf-reel">🍒</div><div class="mf-reel">🍒</div></div>
      <div class="mf-inline"><button class="mf-btn" id="mfSpin">SPIN</button><button class="mf-btn" id="mfSpinBack">Back to Arcade</button></div>
      <div class="mf-big" id="mfSlotOut"></div>
      <div class="mf-sub">3 matching = 100 · 2 matching = 20 · 💎💎💎 = 300 · 7️⃣7️⃣7️⃣ = 500</div></div></div>`, openArcade);
    const spin = $("#mfSpin");
    if (spin) spin.onclick = () => {
      if (num(cfg.tokens) < 5) { notify("Lucky Slots", "You need 5 tokens to spin. Try another game first."); return; }
      addTokens(-5); cfg.plays++; save();
      const r = [pick(SYMBOLS), pick(SYMBOLS), pick(SYMBOLS)];
      $$("#mfReels .mf-reel").forEach((el, i) => { if (el) el.textContent = r[i]; });
      let win = 0;
      if (r[0] === r[1] && r[1] === r[2]) win = r[0] === "7️⃣" ? 500 : r[0] === "💎" ? 300 : 100;
      else if (r[0] === r[1] || r[1] === r[2] || r[0] === r[2]) win = 20;
      if (win) { addTokens(win); best("slots", win); vibe([20, 40, 20]); }
      else vibe(12);
      const out = $("#mfSlotOut");
      if (out) out.innerHTML = win ? `<span style="color:#43c46b">+${win} tokens!</span>` : `<span class="mf-muted">No win this time.</span>`;
      const t = $("#mfTokens"); if (t) t.textContent = num(cfg.tokens).toLocaleString("en-US");
      render();
    };
    const b = $("#mfSpinBack"); if (b) b.onclick = () => { play("choice"); openArcade(); };
  }
  function gameReaction() {
    showScreen("REACTION TEST", arcadeHead("Reaction Test") + `<div class="mf-card">
      <h4>Wait for green…</h4><div class="mf-lead" id="mfReactLead">Tap START, then tap the big button the instant it turns green.</div>
      <div id="mfReactPad" class="mf-tile" style="width:100%;aspect-ratio:auto;height:120px;font-size:16px;font-weight:900;border-radius:12px">TAP TO START</div>
      <div class="mf-big" id="mfReactOut"></div></div>
      <div class="mf-inline"><button class="mf-btn" id="mfReactBack">Back to Arcade</button></div></div>`, openArcade);
    const pad = $("#mfReactPad"), lead = $("#mfReactLead"), out = $("#mfReactOut");
    let phase = "idle", t0 = 0, timer = null;
    if (pad) pad.onclick = () => {
      if (phase === "idle") {
        phase = "wait"; pad.style.background = "rgba(220,80,80,.25)"; pad.textContent = "WAIT…";
        if (lead) lead.textContent = "Don't tap yet…";
        timer = setTimeout(() => {
          phase = "go"; t0 = performance.now();
          pad.style.background = "rgba(67,196,107,.45)"; pad.textContent = "TAP!";
        }, rnd(900, 2800));
      } else if (phase === "wait") {
        clearTimeout(timer); phase = "idle";
        pad.style.background = ""; pad.textContent = "TAP TO START";
        if (out) out.innerHTML = `<span style="color:#e04343">Too early! Wait for green.</span>`;
      } else if (phase === "go") {
        const ms = Math.round(performance.now() - t0);
        phase = "idle"; pad.style.background = ""; pad.textContent = "TAP TO START";
        const reward = ms < 250 ? 40 : ms < 400 ? 25 : ms < 600 ? 12 : 5;
        addTokens(reward); cfg.plays++; best("reaction", Math.max(0, 1000 - ms)); save();
        if (out) out.innerHTML = `<span style="color:#43c46b">${ms} ms — +${reward} tokens!</span>`;
        if (lead) lead.textContent = "Tap START to try again.";
        const t = $("#mfTokens"); if (t) t.textContent = num(cfg.tokens).toLocaleString("en-US");
        vibe([20, 40, 20]); render();
      }
    };
    const b = $("#mfReactBack"); if (b) b.onclick = () => { clearTimeout(timer); play("choice"); openArcade(); };
  }
  function gameRPS() {
    const L = life(); L.rps = L.rps || { me: 0, cpu: 0 };
    const s = L.rps;
    const opts = [["r", "✊ Rock"], ["p", "✋ Paper"], ["s", "✌️ Scissors"]];
    showScreen("ROCK PAPER SCISSORS", arcadeHead("RPS") + `<div class="mf-card">
      <h4>First to 3 wins · 40 tokens</h4>
      <div class="mf-reels"><div class="mf-reel" id="mfRpsMe">${s.me}</div><div class="mf-reel" style="font-size:18px">YOU : CPU</div><div class="mf-reel" id="mfRpsCpu">${s.cpu}</div></div>
      <div class="mf-inline">${opts.map(([k, t]) => `<button class="mf-btn" data-mf-rps="${k}">${t}</button>`).join("")}</div>
      <div class="mf-big" id="mfRpsOut"></div></div>
      <div class="mf-inline"><button class="mf-btn" id="mfRpsReset">New match</button><button class="mf-btn" id="mfRpsBack">Back to Arcade</button></div></div>`, openArcade);
    const beats = { r: "s", p: "r", s: "p" };
    $$("[data-mf-rps]").forEach((b) => b.onclick = () => {
      const me = b.dataset.mfRps, cpu = pick(["r", "p", "s"]);
      const out = $("#mfRpsOut");
      cfg.plays++; save();
      let txt;
      if (me === cpu) txt = "Draw.";
      else if (beats[me] === cpu) { s.me++; txt = `<span style="color:#43c46b">You win the round!</span>`; vibe(10); }
      else { s.cpu++; txt = `<span style="color:#e04343">CPU wins the round.</span>`; }
      if (s.me >= 3 || s.cpu >= 3) {
        const won = s.me >= 3;
        if (won) { addTokens(40); best("rps", num(cfg.best.rps) + 1); vibe([20, 40, 20, 40]); }
        txt += won ? ` <b>Match won! +40 tokens.</b>` : ` <b>Match lost.</b>`;
        s.me = 0; s.cpu = 0;
        $$("[data-mf-rps]").forEach((x) => x.disabled = true);
        const t = $("#mfTokens"); if (t) t.textContent = num(cfg.tokens).toLocaleString("en-US");
        render();
      }
      const a = $("#mfRpsMe"), c = $("#mfRpsCpu");
      if (a) a.textContent = s.me; if (c) c.textContent = s.cpu;
      if (out) out.innerHTML = txt;
    });
    const r = $("#mfRpsReset"); if (r) r.onclick = () => { s.me = 0; s.cpu = 0; play("choice"); gameRPS(); };
    const b = $("#mfRpsBack"); if (b) b.onclick = () => { play("choice"); openArcade(); };
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
  function countryOptions(sel) {
    let out = "";
    try {
      const C = window.COUNTRIES || {};
      const codes = Object.keys(C).sort((a, b) => String(C[a][0]).localeCompare(String(C[b][0])));
      out = codes.map((c) => `<option value="${esc(c)}"${c === sel ? " selected" : ""}>${esc(C[c][0])}</option>`).join("");
    } catch (e) {}
    return out || '<option value="us">United States</option>';
  }
  function countryName(c) {
    try { return (window.COUNTRIES[c] || [c])[0]; } catch (e) { return c; }
  }
  function applyCustomCities() {
    try {
      const C = window.CITIES;
      if (!C) return;
      for (const x of cfg.customCities) {
        if (!x || !x.name || !x.country) continue;
        if (!Array.isArray(C[x.country])) C[x.country] = [];
        if (C[x.country].indexOf(x.name) < 0) C[x.country].push(x.name);
      }
    } catch (e) {}
  }
  function openCustomCities() {
    applyCustomCities();
    const list = cfg.customCities.length ? cfg.customCities.map((x, i) =>
      `<div class="row" data-mf-city="${i}"><img src="${ico("city")}" alt=""><div class="t"><b>${esc(x.name)}</b><span>${esc(countryName(x.country))} · appears in city pickers and immigration</span></div><div class="mf-row-actions"><button class="mf-mini" data-mf-go="${i}">Move here</button><button class="mf-mini" data-mf-del="${i}">Delete</button></div></div>`).join("")
      : '<div class="mf-lead">No custom cities yet. Add one below and it will show up in the city lists in the game.</div>';
    showScreen("CUSTOM CITIES", `<div class="mf-wrap">
      <div class="mf-lead">Add your hometown to the game. Custom cities are saved on this device and injected into the real city pickers (New Life, Emigrate, friend moves) as soon as you add them.</div>
      <div class="sec">Your cities</div>${list}
      <div class="sec">Add a city</div>
      <div class="mf-card">
        <label class="mf-lab">Country</label><select class="mf-input" id="mfCityCountry">${countryOptions("us")}</select>
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
        state.country = x.country; state.city = x.name;
        sayIt(`I moved to ${x.name}, ${countryName(x.country)}.`);
        notify("Moved", `You now live in ${x.name}, ${countryName(x.country)}.`);
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
    ["crime", "Crime", "crime"], ["doctor", "Doctor", "doctor"], ["emigrate", "Emigrate", "passport"],
    ["fertility", "Fertility", "fertility"], ["fight", "Fight Betting", "fight"], ["gamble", "Gamble", "gamble"],
    ["horse", "Horse Races", "horse"], ["hunting", "Hunting & Fishing", "hunting"], ["identity", "Identity", "identity"],
    ["lawsuit", "Lawsuit", "lawsuit"], ["licenses", "Licenses", "licenses"], ["loan", "Loan", "loan"],
    ["lottery", "Lottery", "lottery"], ["love", "Love", "love"], ["mindbody", "Mind & Body", "mindbody"],
    ["movies", "Movie Theater", "movies"], ["nightlife", "Nightlife", "nightlife"], ["pets", "Pets", "pets"],
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
    ["Do custom cities really appear in the game?", "Yes. They're injected into the real city lists used by New Life, Emigrate and friend moves as soon as you add them."],
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
