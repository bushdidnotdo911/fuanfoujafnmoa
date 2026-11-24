/* ==========================================================================
 * us-states.js — Free Life, United States edition
 * --------------------------------------------------------------------------
 * The country layer is fixed to "us". Everything else in the game now runs on
 * a State -> City hierarchy: New Life, Relocate, Vacation, Custom Cities,
 * the profile flag, the family-tree globe and the political career.
 *
 * Must be loaded LAST: it wraps globals declared by game.html.
 * All art is generated raster PNG in states/ — no SVG, no coded artwork.
 * ========================================================================== */
(function () {
  if (window.US_STATES) return;

  var DATA = {"AL":{"name":"Alabama","capital":"Montgomery","region":"South","cities":["Birmingham","Montgomery","Mobile","Huntsville","Tuscaloosa","Dothan","Decatur","Florence","Gadsden","Anniston"],"pt":[-86.8,32.8],"nick":"Yellowhammer State","since":1819,"col":0.85,"tax":4},"AK":{"name":"Alaska","capital":"Juneau","region":"West","cities":["Anchorage","Fairbanks","Juneau","Sitka","Ketchikan","Wasilla","Barrow","Bethel","Nome","Palmer"],"pt":[-149.5,64.0],"nick":"The Last Frontier","since":1959,"col":1.25,"tax":0},"AZ":{"name":"Arizona","capital":"Phoenix","region":"West","cities":["Phoenix","Tucson","Mesa","Chandler","Glendale","Scottsdale","Gilbert","Tempe","Peoria","Flagstaff","Sedona"],"pt":[-111.4,34.3],"nick":"Grand Canyon State","since":1912,"col":1.0,"tax":5.6},"AR":{"name":"Arkansas","capital":"Little Rock","region":"South","cities":["Little Rock","Fort Smith","Fayetteville","Springdale","Jonesboro","North Little Rock","Conway","Rogers","Pine Bluff","Bentonville"],"pt":[-92.4,34.8],"nick":"Natural State","since":1836,"col":0.84,"tax":6.5},"CA":{"name":"California","capital":"Sacramento","region":"West","cities":["Los Angeles","San Francisco","San Diego","Sacramento","San Jose","Fresno","Oakland","Long Beach","Santa Monica","Pasadena","Bakersfield","Anaheim","Riverside","Stockton"],"pt":[-119.7,36.7],"nick":"Golden State","since":1850,"col":1.38,"tax":7.25},"CO":{"name":"Colorado","capital":"Denver","region":"West","cities":["Denver","Colorado Springs","Aurora","Fort Collins","Boulder","Pueblo","Greeley","Grand Junction","Aspen","Durango"],"pt":[-105.5,39.0],"nick":"Centennial State","since":1876,"col":1.08,"tax":2.9},"CT":{"name":"Connecticut","capital":"Hartford","region":"Northeast","cities":["Bridgeport","New Haven","Hartford","Stamford","Waterbury","Norwalk","Danbury","New Britain","Greenwich","Mystic"],"pt":[-72.7,41.6],"nick":"Constitution State","since":1788,"col":1.16,"tax":6.35},"DE":{"name":"Delaware","capital":"Dover","region":"Northeast","cities":["Wilmington","Dover","Newark","Middletown","Smyrna","Milford","Seaford","Georgetown","Elsmere","New Castle"],"pt":[-75.5,39.0],"nick":"First State","since":1787,"col":1.01,"tax":0},"DC":{"name":"District of Columbia","capital":"Washington","region":"South","cities":["Washington, D.C.","Georgetown","Anacostia","Capitol Hill","Adams Morgan","Dupont Circle","Foggy Bottom","Brookland","Petworth","Chevy Chase"],"pt":[-77.0,38.9],"nick":"Federal District","since":1790,"col":1.45,"tax":6},"FL":{"name":"Florida","capital":"Tallahassee","region":"South","cities":["Miami","Orlando","Tampa","Jacksonville","Tallahassee","St. Petersburg","Fort Lauderdale","Sarasota","Naples","Key West","Daytona Beach","Gainesville"],"pt":[-81.5,27.8],"nick":"Sunshine State","since":1845,"col":1.03,"tax":6},"GA":{"name":"Georgia","capital":"Atlanta","region":"South","cities":["Atlanta","Savannah","Augusta","Macon","Columbus","Athens","Roswell","Sandy Springs","Albany","Valdosta"],"pt":[-83.4,32.6],"nick":"Peach State","since":1788,"col":0.93,"tax":4},"HI":{"name":"Hawaii","capital":"Honolulu","region":"West","cities":["Honolulu","Hilo","Kailua","Kapolei","Kaneohe","Waipahu","Pearl City","Waimea","Lahaina","Lihue"],"pt":[-157.0,20.8],"nick":"Aloha State","since":1959,"col":1.6,"tax":4},"ID":{"name":"Idaho","capital":"Boise","region":"West","cities":["Boise","Meridian","Nampa","Idaho Falls","Pocatello","Caldwell","Coeur d'Alene","Twin Falls","Lewiston","Sun Valley"],"pt":[-114.7,44.1],"nick":"Gem State","since":1890,"col":0.94,"tax":6},"IL":{"name":"Illinois","capital":"Springfield","region":"Midwest","cities":["Chicago","Springfield","Aurora","Rockford","Joliet","Naperville","Peoria","Champaign","Waukegan","Evanston","Galena"],"pt":[-89.0,40.0],"nick":"Prairie State","since":1818,"col":0.96,"tax":6.25},"IN":{"name":"Indiana","capital":"Indianapolis","region":"Midwest","cities":["Indianapolis","Fort Wayne","Evansville","South Bend","Carmel","Fishers","Bloomington","Hammond","Gary","Lafayette"],"pt":[-86.3,39.9],"nick":"Hoosier State","since":1816,"col":0.87,"tax":7},"IA":{"name":"Iowa","capital":"Des Moines","region":"Midwest","cities":["Des Moines","Cedar Rapids","Davenport","Sioux City","Iowa City","Waterloo","Council Bluffs","Ames","Dubuque","Burlington"],"pt":[-93.5,42.1],"nick":"Hawkeye State","since":1846,"col":0.88,"tax":6},"KS":{"name":"Kansas","capital":"Topeka","region":"Midwest","cities":["Wichita","Topeka","Overland Park","Kansas City","Olathe","Lawrence","Salina","Hutchinson","Leavenworth","Manhattan"],"pt":[-98.4,38.5],"nick":"Sunflower State","since":1861,"col":0.87,"tax":6.5},"KY":{"name":"Kentucky","capital":"Frankfort","region":"South","cities":["Louisville","Lexington","Bowling Green","Owensboro","Covington","Richmond","Frankfort","Paducah","Elizabethtown","Henderson"],"pt":[-85.3,37.5],"nick":"Bluegrass State","since":1792,"col":0.86,"tax":6},"LA":{"name":"Louisiana","capital":"Baton Rouge","region":"South","cities":["New Orleans","Baton Rouge","Shreveport","Lafayette","Lake Charles","Monroe","Alexandria","Houma","Marrero","Natchitoches"],"pt":[-92.0,31.1],"nick":"Pelican State","since":1812,"col":0.89,"tax":4.45},"ME":{"name":"Maine","capital":"Augusta","region":"Northeast","cities":["Portland","Lewiston","Bangor","South Portland","Auburn","Augusta","Biddeford","Waterville","Rockland","Bar Harbor"],"pt":[-69.2,45.3],"nick":"Pine Tree State","since":1820,"col":1.06,"tax":5.5},"MD":{"name":"Maryland","capital":"Annapolis","region":"South","cities":["Baltimore","Annapolis","Columbia","Germantown","Silver Spring","Waldorf","Glen Burnie","Ellicott City","Frederick","Rockville"],"pt":[-76.7,39.0],"nick":"Old Line State","since":1788,"col":1.12,"tax":6},"MA":{"name":"Massachusetts","capital":"Boston","region":"Northeast","cities":["Boston","Worcester","Springfield","Cambridge","Lowell","Brockton","New Bedford","Quincy","Lynn","Salem","Pittsfield"],"pt":[-71.8,42.2],"nick":"Bay State","since":1788,"col":1.32,"tax":6.25},"MI":{"name":"Michigan","capital":"Lansing","region":"Midwest","cities":["Detroit","Grand Rapids","Warren","Sterling Heights","Lansing","Ann Arbor","Flint","Dearborn","Livonia","Traverse City"],"pt":[-85.0,44.3],"nick":"Great Lakes State","since":1837,"col":0.89,"tax":6},"MN":{"name":"Minnesota","capital":"Saint Paul","region":"Midwest","cities":["Minneapolis","Saint Paul","Rochester","Duluth","Bloomington","Brooklyn Park","Plymouth","St. Cloud","Eagan","Woodbury"],"pt":[-94.3,46.0],"nick":"North Star State","since":1858,"col":0.97,"tax":6.875},"MS":{"name":"Mississippi","capital":"Jackson","region":"South","cities":["Jackson","Gulfport","Southaven","Hattiesburg","Biloxi","Meridian","Tupelo","Olive Branch","Greenville","Horn Lake","Vicksburg"],"pt":[-89.7,32.7],"nick":"Magnolia State","since":1817,"col":0.83,"tax":7},"MO":{"name":"Missouri","capital":"Jefferson City","region":"Midwest","cities":["Kansas City","St. Louis","Springfield","Columbia","Independence","Lee's Summit","Jefferson City","St. Joseph","Joplin","Cape Girardeau"],"pt":[-92.5,38.4],"nick":"Show Me State","since":1821,"col":0.88,"tax":4.23},"MT":{"name":"Montana","capital":"Helena","region":"West","cities":["Billings","Missoula","Great Falls","Bozeman","Butte","Helena","Kalispell","Havre","Anaconda","Miles City"],"pt":[-109.5,47.0],"nick":"Treasure State","since":1889,"col":0.93,"tax":0},"NE":{"name":"Nebraska","capital":"Lincoln","region":"Midwest","cities":["Omaha","Lincoln","Bellevue","Grand Island","Kearney","Fremont","Hastings","Norfolk","North Platte","Scottsbluff"],"pt":[-99.9,41.5],"nick":"Cornhusker State","since":1867,"col":0.87,"tax":5.5},"NV":{"name":"Nevada","capital":"Carson City","region":"West","cities":["Las Vegas","Reno","Henderson","Sparks","Carson City","Elko","Boulder City","Mesquite","Fallon","Winnemucca"],"pt":[-116.6,39.3],"nick":"Silver State","since":1864,"col":1.04,"tax":6.85},"NH":{"name":"New Hampshire","capital":"Concord","region":"Northeast","cities":["Manchester","Nashua","Concord","Derry","Dover","Rochester","Salem","Merrimack","Keene","Portsmouth"],"pt":[-71.6,43.7],"nick":"Granite State","since":1788,"col":1.1,"tax":0},"NJ":{"name":"New Jersey","capital":"Trenton","region":"Northeast","cities":["Newark","Jersey City","Paterson","Elizabeth","Trenton","Clifton","Camden","Bayonne","Passaic","Atlantic City","Hoboken"],"pt":[-74.5,40.2],"nick":"Garden State","since":1787,"col":1.2,"tax":6.625},"NM":{"name":"New Mexico","capital":"Santa Fe","region":"West","cities":["Albuquerque","Santa Fe","Las Cruces","Rio Rancho","Roswell","Farmington","Clovis","Hobbs","Taos","Gallup"],"pt":[-106.0,34.5],"nick":"Land of Enchantment","since":1912,"col":0.9,"tax":5.13},"NY":{"name":"New York","capital":"Albany","region":"Northeast","cities":["New York City","Brooklyn","Buffalo","Rochester","Yonkers","Syracuse","Albany","New Rochelle","Mount Vernon","Schenectady","Utica","Ithaca"],"pt":[-75.5,43.0],"nick":"Empire State","since":1788,"col":1.4,"tax":4},"NC":{"name":"North Carolina","capital":"Raleigh","region":"South","cities":["Charlotte","Raleigh","Greensboro","Durham","Winston-Salem","Fayetteville","Cary","Wilmington","Asheville","High Point","Concord"],"pt":[-79.4,35.5],"nick":"Tar Heel State","since":1789,"col":0.92,"tax":4.75},"ND":{"name":"North Dakota","capital":"Bismarck","region":"Midwest","cities":["Fargo","Bismarck","Grand Forks","Minot","West Fargo","Williston","Dickinson","Mandan","Jamestown","Wahpeton"],"pt":[-100.5,47.4],"nick":"Peace Garden State","since":1889,"col":0.88,"tax":5},"OH":{"name":"Ohio","capital":"Columbus","region":"Midwest","cities":["Columbus","Cleveland","Cincinnati","Toledo","Akron","Dayton","Parma","Canton","Youngstown","Lorain","Sandusky"],"pt":[-82.8,40.3],"nick":"Buckeye State","since":1803,"col":0.88,"tax":5.75},"OK":{"name":"Oklahoma","capital":"Oklahoma City","region":"South","cities":["Oklahoma City","Tulsa","Norman","Broken Arrow","Lawton","Edmond","Moore","Midwest City","Enid","Stillwater"],"pt":[-97.5,35.6],"nick":"Sooner State","since":1907,"col":0.85,"tax":4.5},"OR":{"name":"Oregon","capital":"Salem","region":"West","cities":["Portland","Eugene","Salem","Gresham","Hillsboro","Beaverton","Bend","Medford","Springfield","Corvallis","Ashland"],"pt":[-120.5,43.9],"nick":"Beaver State","since":1859,"col":1.12,"tax":0},"PA":{"name":"Pennsylvania","capital":"Harrisburg","region":"Northeast","cities":["Philadelphia","Pittsburgh","Allentown","Erie","Reading","Scranton","Bethlehem","Lancaster","Harrisburg","Altoona","York"],"pt":[-77.8,40.9],"nick":"Keystone State","since":1787,"col":0.95,"tax":6},"RI":{"name":"Rhode Island","capital":"Providence","region":"Northeast","cities":["Providence","Warwick","Cranston","Pawtucket","East Providence","Woonsocket","Coventry","Cumberland","North Kingstown","Newport"],"pt":[-71.5,41.7],"nick":"Ocean State","since":1790,"col":1.1,"tax":7},"SC":{"name":"South Carolina","capital":"Columbia","region":"South","cities":["Charleston","Columbia","North Charleston","Mount Pleasant","Rock Hill","Greenville","Summerville","Sumter","Goose Creek","Hilton Head Island"],"pt":[-80.9,33.9],"nick":"Palmetto State","since":1788,"col":0.91,"tax":6},"SD":{"name":"South Dakota","capital":"Pierre","region":"Midwest","cities":["Sioux Falls","Rapid City","Aberdeen","Brookings","Watertown","Mitchell","Yankton","Pierre","Huron","Spearfish"],"pt":[-100.2,44.4],"nick":"Mount Rushmore State","since":1889,"col":0.88,"tax":4.5},"TN":{"name":"Tennessee","capital":"Nashville","region":"South","cities":["Nashville","Memphis","Knoxville","Chattanooga","Clarksville","Murfreesboro","Franklin","Jackson","Johnson City","Gatlinburg"],"pt":[-86.3,35.8],"nick":"Volunteer State","since":1796,"col":0.9,"tax":7},"TX":{"name":"Texas","capital":"Austin","region":"South","cities":["Houston","San Antonio","Dallas","Austin","Fort Worth","El Paso","Arlington","Corpus Christi","Plano","Laredo","Lubbock","Galveston"],"pt":[-99.3,31.5],"nick":"Lone Star State","since":1845,"col":0.94,"tax":6.25},"UT":{"name":"Utah","capital":"Salt Lake City","region":"West","cities":["Salt Lake City","West Valley City","Provo","West Jordan","Orem","Sandy","Ogden","St. George","Layton","Park City"],"pt":[-111.7,39.3],"nick":"Beehive State","since":1896,"col":0.97,"tax":4.85},"VT":{"name":"Vermont","capital":"Montpelier","region":"Northeast","cities":["Burlington","South Burlington","Rutland","Barre","Montpelier","Winooski","St. Albans","Newport","Brattleboro","Stowe"],"pt":[-72.7,44.1],"nick":"Green Mountain State","since":1791,"col":1.08,"tax":6},"VA":{"name":"Virginia","capital":"Richmond","region":"South","cities":["Virginia Beach","Norfolk","Richmond","Chesapeake","Newport News","Alexandria","Hampton","Roanoke","Portsmouth","Lynchburg","Charlottesville"],"pt":[-78.8,37.5],"nick":"Old Dominion","since":1788,"col":1.02,"tax":4.3},"WA":{"name":"Washington","capital":"Olympia","region":"West","cities":["Seattle","Spokane","Tacoma","Vancouver","Bellevue","Kent","Everett","Renton","Federal Way","Yakima","Olympia"],"pt":[-120.5,47.4],"nick":"Evergreen State","since":1889,"col":1.18,"tax":6.5},"WV":{"name":"West Virginia","capital":"Charleston","region":"South","cities":["Charleston","Huntington","Morgantown","Parkersburg","Wheeling","Weirton","Fairmont","Beckley","Clarksburg","Martinsburg"],"pt":[-80.6,38.6],"nick":"Mountain State","since":1863,"col":0.84,"tax":6},"WI":{"name":"Wisconsin","capital":"Madison","region":"Midwest","cities":["Milwaukee","Madison","Green Bay","Kenosha","Racine","Appleton","Waukesha","Oshkosh","Eau Claire","Janesville","La Crosse"],"pt":[-89.5,44.6],"nick":"Badger State","since":1848,"col":0.92,"tax":5},"WY":{"name":"Wyoming","capital":"Cheyenne","region":"West","cities":["Cheyenne","Casper","Laramie","Gillette","Rock Springs","Sheridan","Green River","Evanston","Riverton","Jackson"],"pt":[-107.5,43.0],"nick":"Equality State","since":1890,"col":0.92,"tax":4}};
  var REGIONS = ["Northeast", "Midwest", "South", "West"];
  var CODES = Object.keys(DATA).sort(function (a, b) {
    return DATA[a].name.localeCompare(DATA[b].name);
  });
  var CITY_INDEX = {};
  var CUSTOM = {};
  CODES.forEach(function (k) {
    DATA[k].cities.forEach(function (c) {
      (CITY_INDEX[c] || (CITY_INDEX[c] = [])).push(k);
    });
  });

  /* US ice-age / stone-age sites, replacing the old foreign cave list. */
  var CAVES = {
    "the Mammoth Cave region (Kentucky)": [-86.1, 37.2],
    "the Clovis Gravels (New Mexico)": [-103.1, 34.4],
    "the bison jump on the High Plains (Colorado)": [-104.9, 39.0],
    "the Pacific shell middens (California)": [-122.3, 37.8],
    "the Great Lakes shore (Michigan)": [-85.5, 44.5],
    "the Appalachian rock shelter (Tennessee)": [-83.9, 35.9],
    "the Columbia River gorge (Oregon)": [-121.7, 45.7],
    "the Ozark bluff shelters (Arkansas)": [-93.0, 35.8]
  };
  var CAVE_NAMES = Object.keys(CAVES);

  var ICO = {
    flag: "states/flag.png", map: "states/map.png", capitol: "states/capitol.png",
    pin: "states/pin.png", skyline: "states/skyline.png", highway: "states/highway.png",
    truck: "states/truck.png", statehouse: "states/statehouse.png",
    compass: "states/compass.png", star: "states/star.png",
    courthouse: "states/courthouse.png", road: "states/road.png"
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function hash(s) {
    var h = 2166136261;
    s = String(s || "");
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return h >>> 0;
  }
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  function money(n) {
    try { return usd(Math.round(n)); } catch (e) { return "$" + Math.round(n).toLocaleString("en-US"); }
  }
  function play2() { try { play("choice"); } catch (e) {} }
  function say2(t) { try { say(t); } catch (e) {} }
  function notify2(title, text) {
    try { notice(title, text, null, true); } catch (e) {}
  }
  function usdCost(n) { try { return localPrice(n); } catch (e) { return n; } }

  var S = {
    data: DATA,
    ico: ICO,
    regions: REGIONS,
    list: function () { return CODES.slice(); },
    name: function (k) { return DATA[k] ? DATA[k].name : "United States"; },
    capital: function (k) { return DATA[k] ? DATA[k].capital : "Washington, D.C."; },
    region: function (k) { return DATA[k] ? DATA[k].region : "South"; },
    citiesOf: function (k) {
      var base = (DATA[k] && DATA[k].cities) ? DATA[k].cities.slice() : [];
      return base.concat(CUSTOM[k] || []);
    },
    stateOfCity: function (c) {
      if (!c) return null;
      var v = CITY_INDEX[c];
      if (v && v.length) return v[0];
      for (var k in CUSTOM) if (CUSTOM[k].indexOf(c) >= 0) return k;
      return null;
    },
    addCity: function (k, name) {
      if (!DATA[k] || !name) return;
      if (!CUSTOM[k]) CUSTOM[k] = [];
      if (CUSTOM[k].indexOf(name) < 0) CUSTOM[k].push(name);
      if (CITY_INDEX[name] && CITY_INDEX[name].indexOf(k) < 0) CITY_INDEX[name].push(k);
      else if (!CITY_INDEX[name]) CITY_INDEX[name] = [k];
      try {
        if (window.CITIES && Array.isArray(window.CITIES.us) && window.CITIES.us.indexOf(name) < 0)
          window.CITIES.us.push(name);
      } catch (e) {}
    },
    applyCustom: function (list) {
      (list || []).forEach(function (x) {
        if (!x || !x.name) return;
        var k = DATA[x.country || x.state] ? (x.country || x.state) : S.stateOfCity(x.name);
        S.addCity(k || "CA", x.name);
      });
    },
    random: function () { return pick(CODES); },
    pickCity: function (k) {
      var a = S.citiesOf(k);
      return a.length ? pick(a) : S.capital(k);
    },
    inRegion: function (r) {
      return CODES.filter(function (k) { return DATA[k].region === r; });
    },
    /* New Life creator: region sections + one button per state. */
    stateRows: function (y, p) {
      var html = "", i = 0, cols = (typeof NL_COLS !== "undefined" ? NL_COLS : ["blue", "green", "pink", "yellow"]);
      REGIONS.forEach(function (r) {
        html += '<div class="sec">' + esc(r) + "</div>";
        S.inRegion(r).forEach(function (k) {
          html += y('data-c="' + k + '"', cols[i++ % cols.length],
            p(ICO.map) + esc(DATA[k].name) + " <small>" + k + " · " + esc(DATA[k].capital) + "</small>");
        });
      });
      return html;
    },
    /* ---------------------------------------------------------------- *
     * Legacy-save normalisation — turns any foreign country / city into
     * a real US state + city, and repairs relatives that "lived abroad".
     * ---------------------------------------------------------------- */
    normalize: function () {
      var st;
      try { st = state; } catch (e) { return; }
      if (!st || typeof st !== "object") return;
      if (st.country !== "us") st.country = "us";
      if (!DATA[st.usState]) {
        st.usState = S.stateOfCity(st.city) || S.random();
      }
      var valid = S.citiesOf(st.usState);
      var legacy = false;
      try { legacy = !!(window.CITIES && window.CITIES.us && window.CITIES.us.indexOf(st.city) >= 0); } catch (e) {}
      if (!valid.length || (valid.indexOf(st.city) < 0 && !legacy)) st.city = S.pickCity(st.usState);
      /* Nobody lives "abroad" any more: everyone is inside the US. */
      try {
        [st.parents, st.family, st.friends, st.lovers].forEach(function (arr) {
          (arr || []).forEach(function (r) { if (r && r.livesIn && r.livesIn !== "us") r.livesIn = "us"; });
        });
        (st.props || []).forEach(function (p) { if (p && p.country && p.country !== "us") p.country = "us"; });
      } catch (e) {}
      /* Profile flag: the old flags/ folder held foreign flags. */
      try {
        var f = document.querySelectorAll(".phone > .profile .pflag, .pflag");
        for (var i = 0; i < f.length; i++) {
          if (f[i].getAttribute("src") !== ICO.flag) { f[i].src = ICO.flag; f[i].alt = "United States"; }
          else f[i].alt = "United States";
        }
      } catch (e) {}
    },

    /* ---------------------------------------------------------------- *
     * My State — a real screen with state facts and controls.
     * ---------------------------------------------------------------- */
    openState: function () {
      S.normalize();
      var k = state.usState, d = DATA[k], city = state.city || d.capital;
      var isCap = city === d.capital;
      var col = d.col, tax = d.tax;
      var colWord = col >= 1.25 ? "Very high" : col >= 1.08 ? "High" : col >= .96 ? "Average" : col >= .88 ? "Low" : "Very low";
      var row = function (ico, label, val, key) {
        return '<div class="row"' + (key ? ' data-us="' + key + '"' : "") + '><img src="' + ico + '" alt="">' +
          '<div class="t"><b>' + esc(label) + "</b><span>" + esc(val) + "</span></div>" +
          (key ? '<span class="chev">›</span>' : "") + "</div>";
      };
      var html = '<div class="mf-wrap"><div class="mf-lead">You live in <b>' + esc(city) + ", " + k +
        "</b> — " + esc(d.name) + ", the " + esc(d.nick) + ". " +
        (isCap ? "It is the state capital." : "The capital is " + esc(d.capital) + ".") + "</div>" +
        '<div class="sec">' + esc(d.name) + " · " + k + "</div>" +
        row(ICO.statehouse, "Capital", d.capital) +
        row(ICO.compass, "Region", d.region) +
        row(ICO.star, "Nickname", d.nick) +
        row(ICO.courthouse, "Statehood", "Admitted to the Union in " + d.since) +
        row(ICO.skyline, "Cities on file", S.citiesOf(k).length + " cities") +
        row(ICO.highway, "Cost of living", colWord + " (" + Math.round(col * 100) + "% of the US average)") +
        row(ICO.capitol, "State sales tax", tax.toFixed(2).replace(/\.00$/, "") + "% (state rate)") +
        '<div class="sec">Your options</div>' +
        row(ICO.truck, "Relocate", "Move to another state and city", "relocate") +
        row(ICO.map, "Compare states", "Browse all 51 states by cost of living", "compare") +
        row(ICO.pin, "Tour the state", "Visit " + S.citiesOf(k).length + " cities in " + d.name, "tour") +
        row(ICO.flag, "State facts", "A few things about " + d.name, "facts") +
        '<div class="mf-sub">All 50 states and Washington, D.C. · ' +
        Object.keys(DATA).length + " states · " +
        CODES.reduce(function (n, x) { return n + S.citiesOf(x).length; }, 0) + " cities</div></div>";
      try {
        play2();
        sSub.style.display = "none";
        sTitle.textContent = "MY STATE";
        sBack.innerHTML = BACK_ICON;
        sBack.onclick = function () { try { openActivities(); } catch (e) { screen.classList.remove("open"); } };
        sList.innerHTML = html;
        sList.scrollTop = 0;
        screen.classList.add("open");
        sList.querySelectorAll("[data-us]").forEach(function (b) {
          b.onclick = function () {
            var a = b.getAttribute("data-us");
            if (a === "relocate") S.openRelocate();
            else if (a === "compare") S.openCompare();
            else if (a === "tour") S.openTour(k);
            else S.openFacts(k);
          };
        });
      } catch (e) { notify2("My State", d.name + " · " + city + ", " + k); }
    },
    openCompare: function () {
      var arr = CODES.slice().sort(function (a, b) { return DATA[b].col - DATA[a].col; });
      var html = '<div class="mf-wrap"><div class="mf-lead">Cost of living, highest to lowest. ' +
        "100% is the US average.</div>";
      REGIONS.forEach(function (r) {
        html += '<div class="sec">' + esc(r) + "</div>";
        arr.filter(function (k) { return DATA[k].region === r; }).forEach(function (k) {
          var d = DATA[k];
          html += '<div class="row"><img src="' + ICO.map + '" alt=""><div class="t"><b>' + esc(d.name) +
            " <small>" + k + "</small></b><span>" + Math.round(d.col * 100) + "% · capital " + esc(d.capital) +
            " · " + S.citiesOf(k).length + " cities</span></div></div>";
        });
      });
      html += "</div>";
      S.screen("COST OF LIVING", html);
    },
    openTour: function (k) {
      var d = DATA[k];
      var html = '<div class="mf-wrap"><div class="mf-lead">Cities in ' + esc(d.name) +
        ". Capital: <b>" + esc(d.capital) + "</b>.</div>";
      S.citiesOf(k).slice().sort().forEach(function (c) {
        html += '<div class="row"><img src="' + ICO.pin + '" alt=""><div class="t"><b>' + esc(c) +
          "</b><span>" + (c === d.capital ? "State capital" : esc(d.name)) + "</span></div></div>";
      });
      html += "</div>";
      S.screen(d.name.toUpperCase(), html);
    },
    openFacts: function (k) {
      var d = DATA[k];
      var lines = [
        d.name + " is known as the " + d.nick + ".",
        "It joined the Union in " + d.since + ".",
        "Its capital is " + d.capital + ".",
        "It sits in the " + d.region + ".",
        "The state sales tax rate is " + d.tax.toFixed(2).replace(/\.00$/, "") + "%.",
        "Cost of living runs about " + Math.round(d.col * 100) + "% of the national average.",
        S.citiesOf(k).length + " cities are on file, from " + S.citiesOf(k)[0] + " to " + S.citiesOf(k).slice(-1)[0] + "."
      ];
      var html = '<div class="mf-wrap"><div class="mf-lead">A few things about ' + esc(d.name) + ".</div>" +
        lines.map(function (t) {
          return '<div class="mf-card"><div class="mf-lead">' + esc(t) + "</div></div>";
        }).join("") +
        '<div class="sec">Move here</div>' +
        '<div class="row" data-us-relocate><img src="' + ICO.truck + '" alt=""><div class="t"><b>Relocate to ' +
        esc(d.name) + "</b><span>Pick a city and move</span></div></div></div>";
      S.screen("STATE FACTS", html);
      try {
        var b = sList.querySelector("[data-us-relocate]");
        if (b) b.onclick = function () { S.openRelocate(k); };
      } catch (e) {}
    },
    screen: function (title, html) {
      try {
        play2();
        sSub.style.display = "none";
        sTitle.textContent = title;
        sBack.innerHTML = BACK_ICON;
        sBack.onclick = function () { S.openState(); };
        sList.innerHTML = html;
        sList.scrollTop = 0;
        screen.classList.add("open");
      } catch (e) { notify2(title, "United States"); }
    },

    /* ---------------------------------------------------------------- *
     * Relocate — replaces Emigrate. Region -> State -> City.
     * ---------------------------------------------------------------- */
    openRelocate: function (startState) {
      S.normalize();
      try { var old = document.getElementById("nlm"); if (old) old.remove(); } catch (e) {}
      var host;
      try { host = document.querySelector(".phone"); } catch (e) {}
      if (!host) return;
      var wrap = document.createElement("div");
      wrap.id = "nlm";
      host.appendChild(wrap);
      var cols = (typeof NL_COLS !== "undefined" ? NL_COLS : ["blue", "green", "pink", "yellow"]);
      var xicon = (typeof X_ICON !== "undefined" ? X_ICON : "✕");
      var bicon = (typeof BACK_ICON !== "undefined" ? BACK_ICON : "‹");
      var current = state.usState, curCity = state.city;
      var sel = startState && DATA[startState] ? startState : null;

      function btn(attrs, color, inner) {
        return '<button class="nl-btn c-' + color + '" ' + attrs + ">" + inner + "</button>";
      }
      function img(src) { return '<img class="nl-ico" src="' + src + '" alt="">'; }
      function head(title, sub, ico, back) {
        return '<button class="nl-back ' + (back ? "" : "nl-x") + '" data-close>' + (back ? bicon : xicon) + "</button>" +
          '<div class="nl-head"><h2>' + img(ico) + esc(title) + "</h2><p>" + esc(sub) + "</p></div>";
      }
      function close() {
        play2();
        wrap.style.transition = "opacity .25s";
        wrap.style.opacity = 0;
        setTimeout(function () { try { wrap.remove(); } catch (e) {} }, 250);
      }
      function page(html, backFn) {
        var d = document.createElement("div");
        d.className = "nl-page";
        d.innerHTML = html;
        wrap.innerHTML = "";
        wrap.appendChild(d);
        var c = d.querySelector("[data-close]");
        if (c) c.onclick = backFn ? backFn : close;
        d.querySelectorAll("[data-go]").forEach(function (b) {
          b.onclick = function () { play2(); route(b.getAttribute("data-go"), b.getAttribute("data-v")); };
        });
        d.scrollTop = 0;
      }
      function route(go, v) {
        if (go === "region") {
          var list = S.inRegion(v);
          var h = head(v, list.length + " states", ICO.compass, true) +
            list.map(function (k, i) {
              return btn('data-go="state" data-v="' + k + '"', cols[i % cols.length],
                img(ICO.map) + esc(DATA[k].name) + " <small>" + k + " · " + esc(DATA[k].capital) +
                " · " + S.citiesOf(k).length + " cities</small>");
            }).join("");
          page(h, function () { route("home"); });
        } else if (go === "state") {
          sel = v;
          var d = DATA[v], cities = S.citiesOf(v).slice().sort();
          var h2 = head(d.name, "Pick a city · " + d.nick, ICO.statehouse, true) +
            '<div class="sec">Relocation estimate</div>' +
            '<div class="mf-card"><div class="mf-lead">Moving to ' + esc(d.name) + " costs about " +
            money(usdCost(1200 + Math.round((d.col - 1) * 900))) + ". State sales tax " +
            d.tax.toFixed(2).replace(/\.00$/, "") + "%.</div></div>" +
            '<div class="sec">Cities in ' + esc(d.name) + "</div>" +
            cities.map(function (c, i) {
              return btn('data-go="move" data-v="' + esc(c) + '"', cols[i % cols.length],
                img(ICO.pin) + esc(c) + (c === d.capital ? " <small>capital</small>" : ""));
            }).join("") +
            btn('data-go="random" data-v="' + v + '"', "green", img(ICO.star) + "Surprise me — any city in " + esc(d.name));
          page(h2, function () { route("home"); });
        } else if (go === "random") {
          move(v, S.pickCity(v));
        } else if (go === "move") {
          move(sel, v);
        } else if (go === "all") {
          var all = CODES.map(function (k, i) {
            return btn('data-go="state" data-v="' + k + '"', cols[i % cols.length],
              img(ICO.map) + esc(DATA[k].name) + " <small>" + k + "</small>");
          }).join("");
          page(head("All states", "50 states and Washington, D.C.", ICO.flag, true) + all,
            function () { route("home"); });
        } else {
          var home = head("Relocate", "You live in " + curCity + ", " + current + ". Where to?", ICO.truck) +
            '<div class="sec">Pick a region</div>' +
            REGIONS.map(function (r, i) {
              return btn('data-go="region" data-v="' + r + '"', cols[i % cols.length],
                img(ICO.compass) + esc(r) + " <small>" + S.inRegion(r).length + " states</small>");
            }).join("") +
            '<div class="sec">Or</div>' +
            btn('data-go="all"', "yellow", img(ICO.flag) + "Browse all 51 states") +
            btn('data-go="state" data-v="' + S.random() + '"', "green", img(ICO.star) + "Pick a state at random") +
            '<div class="mf-sub">Moving costs money and may cost you your job. Your family stays in the country.</div>';
          page(home);
        }
      }
      function move(k, city) {
        if (!DATA[k]) return;
        var d = DATA[k];
        var cost = usdCost(1200 + Math.round((d.col - 1) * 900));
        if ((state.money || 0) < cost) {
          notify2("Not enough money", "You need another " + money(cost - (state.money || 0)) + " to relocate.");
          return;
        }
        if (k === current && city === curCity) { close(); return; }
        state.money -= cost;
        var from = curCity + ", " + current;
        try { leaveCountry(keepHousehold); } catch (e) {}
        state.country = "us";
        state.usState = k;
        state.city = city;
        if (state.job) {
          if (Math.random() < .55) say2("My employer let me transfer to the " + city + " office.");
          else { say2("I lost my job when I moved out of state."); state.job = null; }
        }
        say2("I relocated from " + from + " to " + city + ", " + k + " for " + money(cost) + ".");
        S.normalize();
        try { renderStats(); } catch (e) {}
        close();
        notify2("Relocated", "You now live in " + city + ", " + d.name + ".");
      }
      wrap.style.opacity = 0;
      /* force a frame so the fade-in transition runs */
      void wrap.offsetWidth;
      wrap.style.transition = "opacity .25s";
      wrap.style.opacity = 1;
      route("home");
    },

    /* ---------------------------------------------------------------- *
     * Vacation — US destinations instead of foreign countries.
     * ---------------------------------------------------------------- */
    openVacation: function () {
      if (state.age < 18) { notify2("Too Young", "You must be at least 18 to go on vacation."); return; }
      if (state.vacationAt === state.age) { notify2("Vacation", "You already went on vacation this year."); return; }
      var pool = CODES.filter(function (k) { return k !== state.usState; });
      var picks = [], seen = {};
      while (picks.length < 3 && pool.length) {
        var k = pick(pool);
        if (seen[k]) { pool = pool.filter(function (x) { return x !== k; }); continue; }
        seen[k] = 1; picks.push(k);
      }
      var trips = picks.map(function (k) {
        var c = S.pickCity(k);
        return { name: DATA[k].name + " (" + c + ")", cost: usdCost(100 * (15 + Math.floor(Math.random() * 46))) };
      });
      var cruise = { cruise: true, name: "a cruise", cost: usdCost(100 * (25 + Math.floor(Math.random() * 56))) };
      var choices = trips.map(function (t) {
        return [t.name + " (" + money(t.cost) + ")", function () { takeTrip(t); }];
      });
      choices.push(["Take a cruise (" + money(cruise.cost) + ")", function () { takeTrip(cruise); }]);
      try {
        play2();
        jCard({
          tag: "Vacation", iconSrc: ICO.road, title: "Vacation",
          lead: "Where in the States would you like to go?", close: true, choices: choices
        });
      } catch (e) { notify2("Vacation", trips.map(function (t) { return t.name; }).join(" · ")); }
    },

    /* ---------------------------------------------------------------- *
     * Family-tree globe — group ancestors by US state, not by country.
     * ---------------------------------------------------------------- */
    wrapGlobe: function () {
      if (!window.glPeople || !window.glPlaces) return;
      var origPeople = window.glPeople;
      window.glPeople = function () {
        var people = origPeople.apply(this, arguments) || [];
        try {
          people.forEach(function (p) {
            if (p.where) {
              p.where = CAVE_NAMES[hash(p.name + "|" + p.born) % CAVE_NAMES.length];
            } else {
              p.usState = DATA[p.usState] ? p.usState : CODES[hash(p.name + "|" + p.born) % CODES.length];
            }
          });
        } catch (e) {}
        return people;
      };
      window.glPlaces = function (people) {
        var m = new Map();
        (people || []).forEach(function (a) {
          var cave = !!a.where;
          var key = cave ? ("cave:" + a.where) : (DATA[a.usState] ? a.usState : "us");
          var name, short, pt;
          if (cave) { name = a.where; short = "Ice Age clan"; pt = CAVES[a.where]; }
          else if (DATA[key]) { name = DATA[key].name; short = DATA[key].nick; pt = DATA[key].pt; }
          else { name = "United States"; short = "United States"; pt = [-98, 39]; }
          if (!pt) return;
          if (!m.has(key)) m.set(key, { key: key, cave: cave, name: name, short: short, pt: pt, people: [] });
          m.get(key).people.push(a);
        });
        return Array.from(m.values()).sort(function (a, b) { return b.people.length - a.people.length; });
      };
    },

    boot: function () {
      /* Enforce the US-only country layer even if a stale countries.js is present. */
      window.COUNTRIES = { us: ["United States", "Washington, D.C."] };
      if (!window.CITIES || !Array.isArray(window.CITIES.us)) {
        window.CITIES = { us: CODES.reduce(function (a, k) { return a.concat(DATA[k].cities); }, []) };
      }
      /* Normalise on every stats render so old saves heal themselves. */
      try {
        var rs = window.renderStats;
        if (typeof rs === "function") {
          window.renderStats = function () {
            try { S.normalize(); } catch (e) {}
            return rs.apply(this, arguments);
          };
        }
      } catch (e) {}
      ["openActivities", "openMainMenu", "openRelationships", "openAssets", "openOccupation"]
        .forEach(function (n) {
          try {
            var f = window[n];
            if (typeof f === "function") {
              window[n] = function () {
                try { S.normalize(); } catch (e) {}
                return f.apply(this, arguments);
              };
            }
          } catch (e) {}
        });
      /* Replace the foreign-country screens. */
      try { window.openEmigrate = function () { S.openRelocate(); }; } catch (e) {}
      try { window.openVacation = function () { S.openVacation(); }; } catch (e) {}
      S.wrapGlobe();
      /* First-load normalisation (deferred: state may not exist yet). */
      try { S.normalize(); } catch (e) {}
      setTimeout(function () { try { S.normalize(); } catch (e) {} }, 300);
    }
  };

  window.US_STATES = S;

  /* The main game script is parsed AFTER this file, so the API object must
   * exist immediately (its life-init code calls US_STATES.random()), while
   * the wrappers must wait until the game's globals have been declared. */
  var booted = false;
  var rawBoot = S.boot;
  S.boot = function () {
    if (booted) return;
    booted = true;
    return rawBoot.apply(this, arguments);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { S.boot(); }, { once: true });
  } else {
    S.boot();
  }
})();
