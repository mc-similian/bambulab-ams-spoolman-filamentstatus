document.addEventListener("DOMContentLoaded", () => {
  const toggleButton = document.getElementById("dark-mode-toggle");
  const body = document.body;
  const darkModeIcon = document.getElementById("dark-mode-icon");
  const logContainer = document.getElementById("logs");
  const logBox = document.getElementById("log-box");
  let logAPI;

  const lightModeIcon = "https://img.icons8.com/ios-glyphs/30/moon-symbol.png";
  const darkModeIconUrl = "https://img.icons8.com/color/48/sun--v1.png";

  // Dark Mode Toggle
  const darkModeEnabled = localStorage.getItem("dark-mode") === "true";
  if (darkModeEnabled) {
    body.classList.add("dark-mode");
    darkModeIcon.src = darkModeIconUrl;
  }

  toggleButton.addEventListener("click", () => {
    const isDarkMode = body.classList.toggle("dark-mode");
    darkModeIcon.src = isDarkMode ? darkModeIconUrl : lightModeIcon;
    localStorage.setItem("dark-mode", isDarkMode);
  });

  // Query parameters
  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  const printerSerial = getQueryParam("serial");
  const name = getQueryParam("name");

  if (name === "server") {
    document.getElementById("headline").textContent = "Server";
    logAPI = `/api/logs/server`;
  } else if (printerSerial) {
    document.getElementById("headline").textContent = `${name} - ${printerSerial}`;
    logAPI = `/api/logs/${printerSerial}`;
  } else {
    logContainer.innerHTML = '<p>Error: No printer serial provided in the URL.</p>';
    return;
  }

  // Load logs dynamically
  async function loadLogs() {
    try {
      const response = await fetch(logAPI);
      if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);

      const logData = await response.json();
      if (!logData.logs || logData.logs.length === 0) {
        logContainer.innerHTML = "<p>No log files found.</p>";
        return;
      }

      // Update logs and scroll down
      logContainer.innerHTML = logData.logs
        .map((line) => `<p>${line}</p>`)
        .join("");
                
        requestAnimationFrame(() => {
          setTimeout(() => {
            logBox.scrollTop = logContainer.scrollHeight;
          }, 0);
        });
    } catch (error) {
      console.error("Error loading logs:", error);
      logContainer.innerHTML = "<p>Error loading logs. Please try again later.</p>";
    }
  }

  // Load logs periodically
  loadLogs(); // Initial load
  setInterval(loadLogs, 5000); // Reload logs every 5 seconds
});
