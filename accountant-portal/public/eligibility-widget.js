var IM_KEY = "6LdqX5stAAAAAKHh4l7Fe89p255lJf9pMPP2gDCW";
var IM_API = "https://logistis.i-mentor.gr/api/public/eligibility-check";

// Inject widget styles that aren't in the WP HTML block
(function() {
  var s = document.createElement("style");
  s.textContent = [
    // reCAPTCHA badge — some WP themes hide it
    ".grecaptcha-badge{visibility:visible!important;opacity:1!important;display:block!important;}",
    // Not-found card
    "#imWidget .im-notfound{padding:8px 0 4px;}",
    "#imWidget .im-notfound-top{display:flex!important;gap:14px!important;align-items:flex-start!important;background:#fff8e1!important;border:1px solid #ffe082!important;border-radius:12px!important;padding:18px!important;margin-bottom:16px!important;}",
    "#imWidget .im-notfound-icon{font-size:2rem!important;flex-shrink:0!important;line-height:1!important;}",
    "#imWidget .im-notfound-title{font-size:1rem!important;font-weight:700!important;color:#795548!important;margin-bottom:6px!important;line-height:1.35!important;}",
    "#imWidget .im-notfound-sub{font-size:0.85rem!important;color:#8d6e63!important;line-height:1.5!important;}",
    // DYPA tip card
    "#imWidget .im-notfound-dypa{background:linear-gradient(135deg,#e8f5e9 0%,#f1f8e9 100%)!important;border:1px solid #a5d6a7!important;border-radius:12px!important;padding:20px!important;margin-bottom:16px!important;}",
    "#imWidget .im-notfound-dypa-hd{display:flex!important;gap:12px!important;align-items:flex-start!important;margin-bottom:12px!important;}",
    "#imWidget .im-notfound-dypa-ico{font-size:1.7rem!important;flex-shrink:0!important;line-height:1!important;}",
    "#imWidget .im-notfound-dypa-title{font-size:0.98rem!important;font-weight:700!important;color:#2e7d32!important;margin-bottom:4px!important;line-height:1.3!important;}",
    "#imWidget .im-notfound-dypa-sub{font-size:0.83rem!important;color:#388e3c!important;line-height:1.4!important;}",
    "#imWidget .im-notfound-dypa-body{font-size:0.88rem!important;color:#33691e!important;line-height:1.6!important;margin-bottom:14px!important;}",
    "#imWidget .im-notfound-dypa-btn{display:inline-block!important;background:#2e7d32!important;color:#fff!important;font-size:0.87rem!important;font-weight:600!important;padding:10px 20px!important;border-radius:8px!important;text-decoration:none!important;}",
    "#imWidget .im-notfound-dypa-btn:hover{background:#1b5e20!important;}",
  ].join("");
  document.head.appendChild(s);
})();

function imFmt(n) {
  if (n == null) return "";
  return Number(n).toLocaleString("el-GR");
}

function imRow(label, value) {
  if (!value) return "";
  return (
    "<div class='imd-row'>" +
      "<div class='imd-label'>" + label + "</div>" +
      "<div class='imd-value'>" + value + "</div>" +
    "</div>"
  );
}

function imRowHighlight(label, value) {
  if (!value) return "";
  return (
    "<div class='imd-row'>" +
      "<div class='imd-label'>" + label + "</div>" +
      "<div class='imd-value imd-blue'>" + value + "</div>" +
    "</div>"
  );
}

function imRange(min, max, suffix) {
  suffix = suffix || "";
  if (!min && !max) return "";
  if (min && max && min !== max) return imFmt(min) + suffix + " — " + imFmt(max) + suffix;
  return imFmt(min || max) + suffix;
}

function imCategoryDetails(p) {
  var html = "";
  var cat = p.category || "";

  if (cat === "DYPA") {
    html += "<div class='imd-grid'>";
    html += imRowHighlight("ΜΗΝΙΑΙΑ ΕΠΙΧΟΡΗΓΗΣΗ", p.monthlyAmount);
    html += imRowHighlight("ΜΗΝΕΣ ΕΠΙΧΟΡΗΓΗΣΗΣ", p.subsidyMonths);
    html += imRowHighlight("ΣΥΝΟΛΙΚΟ ΟΦΕΛΟΣ", p.totalBenefit);
    html += imRow("ΠΕΡΙΟΧΗ ΙΣΧΥΟΣ", p.regions);
    html += "</div>";
    if (p.beneficiaries) {
      html += "<div class='imd-block'><div class='imd-label'>ΩΦΕΛΟΥΜΕΝΟΙ ΑΝΕΡΓΟΙ</div><div class='imd-text'>" + p.beneficiaries + "</div></div>";
    }
  }

  if (cat === "ESPA" || cat === "RENOVATION") {
    var inv = imRange(p.minInvestment, p.maxInvestment, " €");
    var sub = imRange(p.minSubsidyPct, p.maxSubsidyPct, "%");
    html += "<div class='imd-grid'>";
    html += imRow("ΠΟΣΟ ΕΠΕΝΔΥΣΗΣ", inv);
    html += imRowHighlight("% ΕΠΙΧΟΡΗΓΗΣΗΣ", sub);
    html += "</div>";
    if (p.subsidyNote) {
      html += "<div class='imd-block'><div class='imd-text imd-note'>" + p.subsidyNote + "</div></div>";
    }
    if (p.otherRequirements) {
      var reqs = p.otherRequirements.trim();
      html += "<div class='imd-block'><div class='imd-label'>ΑΛΛΕΣ ΠΡΟΫΠΟΘΕΣΕΙΣ</div><div class='imd-text'>" + reqs + "</div></div>";
    }
  }

  if (cat === "MICROCREDITS") {
    var rate = imRange(p.minInterestRate, p.maxInterestRate, "%");
    var loan = imRange(p.minInvestment, p.maxInvestment, " €");
    html += "<div class='imd-grid'>";
    html += imRowHighlight("ΕΠΙΤΟΚΙΟ", rate);
    html += imRow("ΠΟΣΟ ΔΑΝΕΙΟΥ", loan);
    html += "</div>";
    if (p.keyPoints && p.keyPoints.length > 0) {
      html += "<div class='imd-block'><div class='imd-label'>ΠΡΟΣΘΕΤΕΣ ΠΡΟΫΠΟΘΕΣΕΙΣ</div><div class='imd-tags'>";
      for (var k = 0; k < p.keyPoints.length; k++) {
        html += "<span class='imd-tag'>" + p.keyPoints[k] + "</span>";
      }
      html += "</div></div>";
    }
    if (p.otherRequirements) {
      html += "<div class='imd-block'><div class='imd-text'>" + p.otherRequirements + "</div></div>";
    }
  }

  return html ? "<div class='imd-section'>" + html + "</div>" : "";
}

function imNotFoundCard() {
  return (
    "<div class='im-notfound'>" +
      "<div class='im-notfound-top'>" +
        "<div class='im-notfound-icon'>🔎</div>" +
        "<div>" +
          "<div class='im-notfound-title'>Δεν βρέθηκαν στοιχεία για το ΑΦΜ που καταχωρήσατε</div>" +
          "<div class='im-notfound-sub'>Ελέγξτε ότι το ΑΦΜ είναι σωστό. Αν μόλις ξεκινήσατε δραστηριότητα, τα στοιχεία μπορεί να μην έχουν ακόμα ενημερωθεί στη ΑΑΔΕ.</div>" +
        "</div>" +
      "</div>" +
      "<div class='im-notfound-dypa'>" +
        "<div class='im-notfound-dypa-hd'>" +
          "<span class='im-notfound-dypa-ico'>🚀</span>" +
          "<div>" +
            "<div class='im-notfound-dypa-title'>Σκέφτεστε να ξεκινήσετε δική σας επιχείρηση;</div>" +
            "<div class='im-notfound-dypa-sub'>Αν είστε ιδιώτης ή άνεργος, υπάρχουν ειδικά προγράμματα ΔΥΠΑ για εσάς</div>" +
          "</div>" +
        "</div>" +
        "<div class='im-notfound-dypa-body'>" +
          "Τα προγράμματα <strong>ΔΥΠΑ για Νέες Επιχειρήσεις</strong> απευθύνονται σε εγγεγραμμένους άνεργους που θέλουν να ξεκινήσουν τη δική τους επιχείρηση. " +
          "Προσφέρουν <strong>εφάπαξ επιχορήγηση από 14.000€ έως 17.500€</strong> για την κάλυψη λειτουργικών εξόδων της νέας επιχείρησης — " +
          "χωρίς να χρειάζεται να έχετε ήδη ενεργό ΑΦΜ. " +
          "Επικοινωνήστε μαζί μας για να ελέγξουμε αν πληροίτε τις προϋποθέσεις και να σας καθοδηγήσουμε στη διαδικασία." +
        "</div>" +
        "<a href='https://www.i-mentor.gr/epikoinonia' class='im-notfound-dypa-btn' target='_blank' rel='noopener'>Επικοινωνήστε μαζί μας &rarr;</a>" +
      "</div>" +
      "<div class='im-promo'>" +
        "<div class='im-promo-hd'>" +
          "<span class='im-promo-ico'>⚖️</span>" +
          "<div>" +
            "<div class='im-promo-title'>Εξωδικαστικός Μηχανισμός Ρύθμισης Οφειλών</div>" +
            "<div class='im-promo-sub'>Έχετε οφειλές σε εφορία, ΕΦΚΑ, τράπεζες ή Δήμους; Αυτό αφορά εσάς</div>" +
          "</div>" +
        "</div>" +
        "<div class='im-promo-body'>" +
          "Ο Εξωδικαστικός Μηχανισμός (Ν.&nbsp;4738/2020) αφορά τόσο <strong>επιχειρήσεις</strong> όσο και <strong>ιδιώτες</strong>. " +
          "Επιτρέπει τη ρύθμιση όλων των χρεών μαζί — εφορία, ΕΦΚΑ, τράπεζες, Δήμοι — μέσω μίας αίτησης, " +
          "με <strong>δόσεις έως 240 μήνες</strong>, επιτόκιο 3% και δυνατότητα <strong>διαγραφής έως 75–85%</strong> της βασικής οφειλής." +
        "</div>" +
        "<a href='https://www.i-mentor.gr/exodikastikos' class='im-promo-btn' target='_blank' rel='noopener'>Μάθετε περισσότερα για τον Εξωδικαστικό &rarr;</a>" +
      "</div>" +
    "</div>"
  );
}

function imCheck() {
  var afm = document.getElementById("imAfm").value.replace(/\D/g, "");
  var email = document.getElementById("imEmail").value.trim();
  var phone = document.getElementById("imPhone").value.trim();
  var btn = document.getElementById("imBtn");
  var err = document.getElementById("imErr");
  var out = document.getElementById("imOut");

  err.style.display = "none";
  out.style.display = "none";

  if (!/^\d{9}$/.test(afm)) {
    err.textContent = "Παρακαλώ εισάγετε έγκυρο ΑΦΜ (9 ψηφία).";
    err.style.display = "block";
    return;
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    err.textContent = "Παρακαλώ εισάγετε έγκυρο email.";
    err.style.display = "block";
    return;
  }
  if (!phone || phone.replace(/\D/g, "").length < 8) {
    err.textContent = "Παρακαλώ εισάγετε έγκυρο τηλέφωνο.";
    err.style.display = "block";
    return;
  }

  btn.disabled = true;
  btn.innerHTML = "<span class='im-spinner'></span>Αναζήτηση...";

  grecaptcha.ready(function() {
    grecaptcha.execute(IM_KEY, { action: "eligibility_check" }).then(function(token) {
      fetch(IM_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ afm: afm, email: email, phone: phone, recaptchaToken: token })
      })
      .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, status: res.status, data: d }; }); })
      .then(function(r) {
        btn.disabled = false;
        btn.innerHTML = "Έλεγχος Επιλεξιμότητας";

        if (!r.ok) {
          if (r.status === 404) {
            // AFM not found — show a rich card with alternatives
            out.style.display = "block";
            out.innerHTML = imNotFoundCard();
            return;
          }
          err.textContent = r.data.error || "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά.";
          err.style.display = "block";
          out.style.display = "none";
          return;
        }

        out.style.display = "block";

        var bizName = (r.data.business && r.data.business.name) ? r.data.business.name : "";
        var programs = r.data.programs || [];

        if (programs.length === 0) {
          out.innerHTML =
            "<div class='im-nomatch'>" +
              "<div class='im-nomatch-icon'>🔍</div>" +
              "<div class='im-nomatch-title'>Δεν βρέθηκαν ενεργά προγράμματα</div>" +
              "<div class='im-nomatch-text'>Αυτή τη στιγμή δεν υπάρχουν διαθέσιμα χρηματοδοτικά προγράμματα για <strong>" + bizName + "</strong>. Επικοινωνήστε μαζί μας για εξατομικευμένη αξιολόγηση.</div>" +
            "</div>";
          return;
        }

        var catLabels = { DYPA:"ΔΥΠΑ", ESPA:"ΕΣΠΑ", MICROCREDITS:"ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ", EXTRAJUDICIAL:"ΕΞΩΔΙΚΑΣΤΙΚΟΣ", RENOVATION:"ΑΝΑΚΑΙΝΙΣΗ", OTHER:"ΑΛΛΟ" };

        var html =
          "<div class='im-banner'>" +
            "<div class='im-banner-trophy'>🏆</div>" +
            "<div class='im-banner-congrats'>Συγχαρητήρια!</div>" +
            "<div class='im-banner-biz'>" + bizName + "</div>" +
            "<div class='im-banner-msg'>Βρέθηκαν <strong class='im-banner-n'>" + programs.length + " χρηματοδοτικά προγράμματα</strong><br>για τα οποία η επιχείρησή σας είναι αρχικά επιλέξιμη</div>" +
          "</div>" +
          "<div class='im-list'>";

        for (var i = 0; i < programs.length; i++) {
          var p = programs[i];
          var catLabel = catLabels[p.category] || "";

          var subBadge = "";
          if (p.minSubsidyPct || p.maxSubsidyPct) {
            subBadge = imRange(p.minSubsidyPct, p.maxSubsidyPct, "%");
          }

          html += "<div class='im-card' style='animation-delay:" + (i * 0.07) + "s'>";

          // Header
          html += "<div class='im-card-top'>";
          if (catLabel) html += "<span class='im-cat im-cat-" + p.category + "'>" + catLabel + "</span>";
          html += "<div class='im-card-title'>" + p.title + "</div>";
          if (subBadge) html += "<div class='im-subsidy'>💰 Επιδότηση " + subBadge + "</div>";
          html += "</div>";

          // Body
          html += "<div class='im-card-body'>";
          if (p.description) html += "<div class='im-card-desc'>" + p.description + "</div>";

          html += imCategoryDetails(p);

          if (p.matchReasons && p.matchReasons.length > 0) {
            html += "<div class='im-reasons'><div class='im-reasons-hd'>✓ Γιατί ταιριάζει η επιχείρησή σας</div><ul class='im-reasons-ul'>";
            for (var j = 0; j < p.matchReasons.length; j++) {
              html += "<li>" + p.matchReasons[j] + "</li>";
            }
            html += "</ul></div>";
          }

          html += "<a href='" + p.ermisUrl + "' class='im-btn-cta' target='_blank' rel='noopener'>Ενδιαφέρομαι — Ξεκινήστε τη διαδικασία &rarr;</a>";
          html += "</div></div>";
        }

        html += "</div>";

        // Εξωδικαστικός promo — button goes to Θέμις if available
        var themisUrl = r.data.themisUrl || "https://www.i-mentor.gr/exodikastikos";
        html +=
          "<div class='im-promo'>" +
            "<div class='im-promo-hd'>" +
              "<span class='im-promo-ico'>⚖️</span>" +
              "<div>" +
                "<div class='im-promo-title'>Εξωδικαστικός Μηχανισμός Ρύθμισης Οφειλών</div>" +
                "<div class='im-promo-sub'>Έχετε οφειλές σε εφορία, ΕΦΚΑ, τράπεζες ή Δήμους; Αυτό αφορά εσάς</div>" +
              "</div>" +
            "</div>" +
            "<div class='im-promo-body'>" +
              "Ο Εξωδικαστικός Μηχανισμός (Ν.&nbsp;4738/2020) είναι κρατική ηλεκτρονική πλατφόρμα που επιτρέπει " +
              "σε ιδιώτες και επιχειρήσεις να ρυθμίσουν <strong>συνολικά</strong> όλα τους τα χρέη μέσω μίας μόνο αίτησης. " +
              "Αντί να διαπραγματεύεστε με κάθε πιστωτή ξεχωριστά, ένας αλγόριθμος δημιουργεί πρόταση για όλους μαζί — " +
              "με <strong>μακροχρόνιες δόσεις έως 240 μήνες</strong>, σταθερό επιτόκιο 3%, " +
              "και δυνατότητα <strong>διαγραφής έως 75–85%</strong> της βασικής οφειλής." +
              "<br><br>" +
              "Η i-Mentor Consulting αναλαμβάνει ολόκληρη τη διαδικασία — από την αξιολόγηση υπαγωγής " +
              "και τη σύνταξη του φακέλου μέχρι την τελική συμφωνία — με χαμηλό και διαφανές κόστος." +
            "</div>" +
            "<a href='" + themisUrl + "' class='im-promo-btn' target='_blank' rel='noopener'>Μιλήστε με τη Θέμις — Ψηφιακή Σύμβουλος &rarr;</a>" +
          "</div>";

        out.innerHTML = html;
      })
      .catch(function() {
        btn.disabled = false;
        btn.innerHTML = "Έλεγχος Επιλεξιμότητας";
        err.textContent = "Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.";
        err.style.display = "block";
      });
    });
  });
}
