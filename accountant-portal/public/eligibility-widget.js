var IM_KEY = "6LdqX5stAAAAAKHh4l7Fe89p255lJf9pMPP2gDCW";
var IM_API = "https://logistis.i-mentor.gr/api/public/eligibility-check";

function imFmt(n) {
  if (n == null) return "";
  return n.toLocaleString("el-GR");
}

function imCategoryDetails(p) {
  var html = "";
  var cat = p.category || "";

  if (cat === "DYPA") {
    html += "<div class='im-details-grid'>";
    if (p.monthlyAmount) {
      html += "<div class='im-detail-cell'><div class='im-detail-label'>ΜΗΝΙΑΙΑ ΕΠΙΧΟΡΗΓΗΣΗ</div><div class='im-detail-value'>" + p.monthlyAmount + "</div></div>";
    }
    if (p.subsidyMonths) {
      html += "<div class='im-detail-cell'><div class='im-detail-label'>ΜΗΝΕΣ ΕΠΙΧΟΡΗΓΗΣΗΣ</div><div class='im-detail-value'>" + p.subsidyMonths + "</div></div>";
    }
    if (p.totalBenefit) {
      html += "<div class='im-detail-cell'><div class='im-detail-label'>ΣΥΝΟΛΙΚΟ ΟΦΕΛΟΣ</div><div class='im-detail-value im-detail-highlight'>" + p.totalBenefit + "</div></div>";
    }
    html += "</div>";
    if (p.beneficiaries) {
      html += "<div class='im-detail-block'><div class='im-detail-label'>ΩΦΕΛΟΥΜΕΝΟΙ ΑΝΕΡΓΟΙ</div><div class='im-detail-text'>" + p.beneficiaries + "</div></div>";
    }
    if (p.regions) {
      html += "<div class='im-detail-block'><div class='im-detail-label'>ΠΕΡΙΟΧΗ ΙΣΧΥΟΣ</div><div class='im-detail-text'>" + p.regions + "</div></div>";
    }
  }

  if (cat === "ESPA" || cat === "RENOVATION") {
    html += "<div class='im-details-grid'>";
    if (p.minInvestment || p.maxInvestment) {
      var inv = (p.minInvestment ? imFmt(p.minInvestment) + " €" : "") + (p.minInvestment && p.maxInvestment ? " — " : "") + (p.maxInvestment ? imFmt(p.maxInvestment) + " €" : "");
      html += "<div class='im-detail-cell'><div class='im-detail-label'>ΠΟΣΟ ΕΠΕΝΔΥΣΗΣ</div><div class='im-detail-value'>" + inv + "</div></div>";
    }
    if (p.minSubsidyPct || p.maxSubsidyPct) {
      var sub = (p.minSubsidyPct ? p.minSubsidyPct + "%" : "") + (p.minSubsidyPct && p.maxSubsidyPct && p.minSubsidyPct !== p.maxSubsidyPct ? " — " + p.maxSubsidyPct + "%" : (!p.minSubsidyPct && p.maxSubsidyPct ? p.maxSubsidyPct + "%" : ""));
      html += "<div class='im-detail-cell'><div class='im-detail-label'>% ΕΠΙΧΟΡΗΓΗΣΗΣ</div><div class='im-detail-value im-detail-highlight'>" + sub + "</div></div>";
    }
    html += "</div>";
    if (p.subsidyNote) {
      html += "<div class='im-detail-block'><div class='im-detail-text im-detail-note'>" + p.subsidyNote + "</div></div>";
    }
    if (p.otherRequirements) {
      html += "<div class='im-detail-block'><div class='im-detail-label'>ΑΛΛΕΣ ΠΡΟΫΠΟΘΕΣΕΙΣ</div><div class='im-detail-text'>" + p.otherRequirements + "</div></div>";
    }
  }

  if (cat === "MICROCREDITS") {
    html += "<div class='im-details-grid'>";
    if (p.minInterestRate || p.maxInterestRate) {
      var rate = (p.minInterestRate ? p.minInterestRate + "%" : "") + (p.minInterestRate && p.maxInterestRate ? " — " : "") + (p.maxInterestRate ? p.maxInterestRate + "%" : "");
      html += "<div class='im-detail-cell'><div class='im-detail-label'>ΕΠΙΤΟΚΙΟ</div><div class='im-detail-value im-detail-highlight'>" + rate + "</div></div>";
    }
    if (p.minInvestment || p.maxInvestment) {
      var inv2 = (p.minInvestment ? imFmt(p.minInvestment) + " €" : "") + (p.minInvestment && p.maxInvestment ? " — " : "") + (p.maxInvestment ? imFmt(p.maxInvestment) + " €" : "");
      html += "<div class='im-detail-cell'><div class='im-detail-label'>ΠΟΣΟ ΔΑΝΕΙΟΥ</div><div class='im-detail-value'>" + inv2 + "</div></div>";
    }
    html += "</div>";
    if (p.keyPoints && p.keyPoints.length > 0) {
      html += "<div class='im-detail-block'><div class='im-detail-label'>ΠΡΟΣΘΕΤΕΣ ΠΡΟΫΠΟΘΕΣΕΙΣ</div><div class='im-tags'>";
      for (var k = 0; k < p.keyPoints.length; k++) {
        html += "<span class='im-tag'>" + p.keyPoints[k] + "</span>";
      }
      html += "</div></div>";
    }
    if (p.otherRequirements) {
      html += "<div class='im-detail-block'><div class='im-detail-text'>" + p.otherRequirements + "</div></div>";
    }
  }

  return html;
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

        var bizName = r.data.business ? r.data.business.name : "";
        var programs = r.data.programs || [];

        if (programs.length === 0) {
          out.innerHTML =
            "<div class='im-no-match'>" +
              "<div class='im-no-match-icon'>🔍</div>" +
              "<h3>Δεν βρέθηκαν ενεργά προγράμματα</h3>" +
              "<p>Αυτή τη στιγμή δεν υπάρχουν διαθέσιμα χρηματοδοτικά προγράμματα για <strong>" + bizName + "</strong>.<br>Ελέγξτε ξανά σύντομα ή επικοινωνήστε μαζί μας.</p>" +
            "</div>";
          return;
        }

        var html =
          "<div class='im-jackpot'>" +
            "<div class='im-jackpot-trophy'>🏆</div>" +
            "<div class='im-jackpot-congrats'>Συγχαρητήρια!</div>" +
            "<div class='im-jackpot-biz'>" + bizName + "</div>" +
            "<div class='im-jackpot-msg'>Βρέθηκαν <span class='im-jackpot-count'>" + programs.length + " χρηματοδοτικά προγράμματα</span><br>για τα οποία η επιχείρησή σας είναι αρχικά επιλέξιμη</div>" +
          "</div>" +
          "<div class='im-cards'>";

        for (var i = 0; i < programs.length; i++) {
          var p = programs[i];

          var catLabel = "";
          if (p.category === "DYPA") catLabel = "ΔΥΠΑ";
          else if (p.category === "ESPA") catLabel = "ΕΣΠΑ";
          else if (p.category === "MICROCREDITS") catLabel = "ΜΙΚΡΟΠΙΣΤΩΣΕΙΣ";
          else if (p.category === "EXTRAJUDICIAL") catLabel = "ΕΞΩΔΙΚΑΣΤΙΚΟΣ";
          else if (p.category === "RENOVATION") catLabel = "ΑΝΑΚΑΙΝΙΣΗ";

          var subBadge = "";
          if (p.minSubsidyPct || p.maxSubsidyPct) {
            var lo = p.minSubsidyPct ? p.minSubsidyPct + "%" : "";
            var hi = (p.maxSubsidyPct && p.minSubsidyPct !== p.maxSubsidyPct) ? p.maxSubsidyPct + "%" : "";
            subBadge = lo + (lo && hi ? " – " : "") + hi;
          }

          html += "<div class='im-card' style='animation-delay:" + (i * 0.08) + "s'>";
          html += "<div class='im-card-header'>";
          if (catLabel) html += "<span class='im-cat-badge im-cat-" + p.category + "'>" + catLabel + "</span>";
          html += "<h3 class='im-card-title'>" + p.title + "</h3>";
          if (subBadge) html += "<div class='im-sub-badge'>💰 Επιδότηση " + subBadge + "</div>";
          html += "</div>";

          html += "<div class='im-card-body'>";
          if (p.description) html += "<p class='im-card-desc'>" + p.description + "</p>";

          html += imCategoryDetails(p);

          if (p.matchReasons && p.matchReasons.length > 0) {
            html += "<div class='im-reasons'><div class='im-reasons-label'>✓ Γιατί ταιριάζει η επιχείρησή σας</div><ul class='im-reasons-list'>";
            for (var j = 0; j < p.matchReasons.length; j++) {
              html += "<li>" + p.matchReasons[j] + "</li>";
            }
            html += "</ul></div>";
          }

          html += "<a href='" + p.ermisUrl + "' class='im-cta' target='_blank' rel='noopener'>Ενδιαφέρομαι — Ξεκινήστε τη διαδικασία &rarr;</a>";
          html += "</div></div>";
        }

        html += "</div>";

        // Εξωδικαστικός promo card — shown to all
        html +=
          "<div class='im-extra-card'>" +
            "<div class='im-extra-card-header'>" +
              "<span class='im-extra-icon'>⚖️</span>" +
              "<div>" +
                "<div class='im-extra-title'>Εξωδικαστικός Μηχανισμός</div>" +
                "<div class='im-extra-sub'>Αν έχετε οφειλές — αυτό αφορά εσάς</div>" +
              "</div>" +
            "</div>" +
            "<p class='im-extra-desc'>Κρατική ηλεκτρονική πλατφόρμα όπου με <strong>μία αίτηση</strong> μπορείτε να ρυθμίσετε συνολικά όλες τις οφειλές σας — από δάνεια και κάρτες μέχρι ΑΑΔΕ, ΕΦΚΑ και Δήμους. Μακροχρόνιες δόσεις, σταθερό επιτόκιο, δυνατότητα σημαντικής <strong>διαγραφής</strong>.</p>" +
            "<a href='https://www.i-mentor.gr/exodikastikos' class='im-extra-cta' target='_blank' rel='noopener'>Μάθετε περισσότερα &rarr;</a>" +
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
