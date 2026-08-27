var IM_KEY = "6LdqX5stAAAAAKHh4l7Fe89p255lJf9pMPP2gDCW";
var IM_API = "https://logistis.i-mentor.gr/api/public/eligibility-check";

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
      .then(function(res) { return res.json().then(function(d) { return { ok: res.ok, data: d }; }); })
      .then(function(r) {
        btn.disabled = false;
        btn.innerHTML = "Έλεγχος Επιλεξιμότητας";
        out.style.display = "block";

        if (!r.ok) {
          err.textContent = r.data.error || "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά.";
          err.style.display = "block";
          out.style.display = "none";
          return;
        }

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

        // Εξωδικαστικός promo
        html +=
          "<div class='im-promo'>" +
            "<div class='im-promo-hd'>" +
              "<span class='im-promo-ico'>⚖️</span>" +
              "<div>" +
                "<div class='im-promo-title'>Εξωδικαστικός Μηχανισμός</div>" +
                "<div class='im-promo-sub'>Αν έχετε οφειλές — διαβάστε αυτό</div>" +
              "</div>" +
            "</div>" +
            "<div class='im-promo-body'>Κρατική πλατφόρμα για συνολική ρύθμιση οφειλών σε ΑΑΔΕ, ΕΦΚΑ, Δήμους και τράπεζες με <strong>μία αίτηση</strong>. Μακροχρόνιες δόσεις, σταθερό επιτόκιο 3%, δυνατότητα σημαντικής <strong>διαγραφής χρέους</strong>.</div>" +
            "<a href='https://www.i-mentor.gr/exodikastikos' class='im-promo-btn' target='_blank' rel='noopener'>Μάθετε περισσότερα &rarr;</a>" +
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
