(() => {
  const updateEaCardNames = () => {
    document.querySelectorAll(".pilot-account-shell").forEach(shell => {
      const identity = shell.querySelector(".pilot-account-identity")?.textContent ?? "";
      const title = shell.querySelector(".pilot-account-title h3, .pilot-staff-card-title h3");
      if (!title) return;

      const isBreakTrend = /break\s*[-_]?\s*trend/i.test(identity);
      const expectedTitle = isBreakTrend ? "*Trend_By_Capik*" : "*Grid_By_Capik*";
      if (title.textContent !== expectedTitle) title.textContent = expectedTitle;
    });
  };

  const observer = new MutationObserver(updateEaCardNames);
  observer.observe(document.getElementById("root"), {
    childList: true,
    subtree: true,
  });
  updateEaCardNames();
})();
