const { chromium } = require('playwright');

const WEBAPP_URL = process.env.WEBAPP_URL;

const SEARCHES = [
  "https://www.indeed.com/jobs?q=director+restaurant&l=Los+Angeles%2C+CA",
  "https://www.indeed.com/jobs?q=director+operations&l=Los+Angeles%2C+CA",
  "https://www.indeed.com/jobs?q=food+and+beverage+director&l=Los+Angeles%2C+CA",
  "https://www.indeed.com/jobs?q=regional+director+hospitality&l=Los+Angeles%2C+CA",
  "https://www.indeed.com/jobs?q=multi+unit+director&l=Los+Angeles%2C+CA",
  "https://www.indeed.com/jobs?q=general+manager+luxury+hotel&l=Los+Angeles%2C+CA",
  "https://www.indeed.com/jobs?q=director+of+restaurants&l=Los+Angeles%2C+CA"
];

if (!WEBAPP_URL) {
  throw new Error("Missing WEBAPP_URL");
}

function clean(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

async function postJob(job) {
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(job)
  });
  const text = await res.text();
  console.log(`POST ${job.Company} => ${text}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });

  const seen = new Set();

  for (const url of SEARCHES) {
    console.log(`SEARCH ${url}`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);

    const jobs = await page.evaluate(() => {
      const out = [];
      const cards = [...document.querySelectorAll("a[data-jk], a.tapItem, a.jcs-JobTitle")];

      for (const a of cards) {
        const card = a.closest("div, article, li") || a.parentElement;
        const title =
          a.getAttribute("aria-label") ||
          a.textContent ||
          "";

        const href = a.href || "";
        const root = card || document;

        const text = root.innerText || "";
        const company =
          root.querySelector('[data-testid="company-name"]')?.textContent ||
          root.querySelector(".companyName")?.textContent ||
          "";
        const location =
          root.querySelector('[data-testid="text-location"]')?.textContent ||
          root.querySelector(".companyLocation")?.textContent ||
          "";
        const pay =
          root.querySelector('[data-testid="attribute_snippet_testid"]')?.textContent ||
          root.querySelector(".salary-snippet")?.textContent ||
          "";

        out.push({
          Company: company.trim(),
          Role: title.trim(),
          Pay: pay.trim(),
          Notes: location ? `Indeed scrape | Location: ${location.trim()}` : "Indeed scrape",
          URL: href
        });
      }

      return out;
    });

    for (const job of jobs) {
      job.Company = clean(job.Company);
      job.Role = clean(job.Role);
      job.Pay = clean(job.Pay);
      job.Notes = clean(job.Notes);
      job.URL = clean(job.URL);

      if (!job.Role || !job.URL) continue;

      const key = `${job.Company}|${job.Role}|${job.URL}`.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      await postJob(job);
    }
  }

  await browser.close();
})();
