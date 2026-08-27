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
  btn.textContent = "Αναζήτηση...";
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
        btn.textContent = "Έλεγχος Επιλεξιμότητας";
        out.style.display = "block";
        if (!r.ok) {
          err.textContent = r.data.error || "Παρουσιάστηκε σφάλμα. Δοκιμάστε ξανά.";
          err.style.display = "block";
          out.style.display = "none";
          return;
        }
        var html = "<div class='im-biz'>" + r.data.business.name + "</div>";
        if (!r.data.programs || r.data.programs.length === 0) {
          html += "<p class='im-empty'>Δεν βρέθηκαν ενεργά χρηματοδοτικά προγράμματα για την επιχείρησή σας αυτή τη στιγμή.</p>";
        } else {
          for (var i = 0; i < r.data.programs.length; i++) {
            var p = r.data.programs[i];
            var sub = "";
            if (p.minSubsidyPct || p.maxSubsidyPct) {
              sub = "Επιδότηση: " + (p.minSubsidyPct || "") + (p.maxSubsidyPct && p.minSubsidyPct !== p.maxSubsidyPct ? "-" + p.maxSubsidyPct : "") + "%";
            }
            html += "<div class='im-card'>";
            html += "<h3>" + p.title + "</h3>";
            if (p.description) { html += "<p>" + p.description + "</p>"; }
            if (sub) { html += "<div class='im-sub'>" + sub + "</div>"; }
            html += "<a href='" + p.ermisUrl + "' class='im-btn' target='_blank'>Ενδιαφέρομαι &rarr;</a>";
            html += "</div>";
          }
        }
        out.innerHTML = html;
      })
      .catch(function() {
        btn.disabled = false;
        btn.textContent = "Έλεγχος Επιλεξιμότητας";
        err.textContent = "Σφάλμα σύνδεσης. Παρακαλώ δοκιμάστε ξανά.";
        err.style.display = "block";
      });
    });
  });
}
