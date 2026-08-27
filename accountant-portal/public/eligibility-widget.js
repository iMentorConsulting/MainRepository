var IM_KEY = "6LdqX5stAAAAAKHh4l7Fe89p255lJf9pMPP2gDCW";
var IM_API = "https://logistis.i-mentor.gr/api/public/eligibility-check";

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

  btn.disabled = true;
  btn.innerHTML = "<span class='im-spinner'></span> Αναζήτηση...";

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
              "<p>Αυτή τη στιγμή δεν υπάρχουν διαθέσιμα χρηματοδοτικά προγράμματα για <strong>" + bizName + "</strong>. Ελέγξτε ξανά σύντομα!</p>" +
            "</div>";
          return;
        }

        var html =
          "<div class='im-jackpot'>" +
            "<div class='im-jackpot-icon'>🏆</div>" +
            "<div class='im-jackpot-title'>Συγχαρητήρια!</div>" +
            "<div class='im-jackpot-biz'>" + bizName + "</div>" +
            "<div class='im-jackpot-sub'>Βρέθηκαν <strong>" + programs.length + " χρηματοδοτικά προγράμματα</strong> για τα οποία η επιχείρησή σας είναι αρχικά επιλέξιμη</div>" +
          "</div>" +
          "<div class='im-cards'>";

        for (var i = 0; i < programs.length; i++) {
          var p = programs[i];
          var sub = "";
          if (p.minSubsidyPct || p.maxSubsidyPct) {
            var lo = p.minSubsidyPct ? p.minSubsidyPct + "%" : "";
            var hi = p.maxSubsidyPct ? p.maxSubsidyPct + "%" : "";
            sub = lo === hi || !lo ? hi : lo + " – " + hi;
          }
          html +=
            "<div class='im-card' style='animation-delay:" + (i * 0.1) + "s'>" +
              "<div class='im-card-accent'></div>" +
              "<div class='im-card-body'>" +
                "<h3 class='im-card-title'>" + p.title + "</h3>" +
                (p.description ? "<p class='im-card-desc'>" + p.description + "</p>" : "") +
                (sub ? "<div class='im-sub-badge'>💰 Επιδότηση " + sub + "</div>" : "") +
                "<a href='" + p.ermisUrl + "' class='im-cta' target='_blank' rel='noopener'>Ενδιαφέρομαι &rarr;</a>" +
              "</div>" +
            "</div>";
        }

        html += "</div>";
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
