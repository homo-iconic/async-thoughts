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
  console.log(`POST ${job.Company || "[blank company]"} | ${job.Role || "[blank role]"} => ${text}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  });

  const seen = new Set();
  let totalExtracted = 0;
  let totalPosted = 0;
  let totalSkipped = 0;

  for (const url of SEARCHES) {
    console.log(`SEARCH ${url}`);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(3000);

    const jobs = await page.evaluate(() => {
      function txt(el) {
        return (el?.textContent || "").replace(/\s+/g, " ").trim();
      }

      function absHref(href) {
        try {
          return new URL(href, location.origin).toString();
        } catch {
          return href || "";
        }
      }

      const out = [];

      const cardSelectors = [
        '[data-jk]',
        '.job_seen_beacon',
        '[data-testid="slider_item"]',
        'li.result',
        'table.jobCard_mainContent'
      ];

      const cardSet = new Set();

      for (const sel of cardSelectors) {
        document.querySelectorAll(sel).forEach(el => cardSet.add(el));
      }

      const cards = [...cardSet];

      for (const card of cards) {
        const titleLink =
          card.querySelector('h2 a') ||
          card.querySelector('a.jcs-JobTitle') ||
          card.querySelector('a[data-jk]') ||
          card.querySelector('a');

        const role =
          txt(titleLink) ||
          titleLink?.getAttribute("aria-label") ||
          "";

        const url = absHref(titleLink?.href || "");

        const company =
          txt(card.querySelector('[data-testid="company-name"]')) ||
          txt(card.querySelector('.companyName')) ||
          txt(card.querySelector('[data-testid="company-name-with-rating"]')) ||
          "";

        const location =
          txt(card.querySelector('[data-testid="text-location"]')) ||
          txt(card.querySelector('.companyLocation')) ||
          "";

        const pay =
          txt(card.querySelector('.salary-snippet')) ||
          txt(card.querySelector('[data-testid="attribute_snippet_testid"]')) ||
          txt(card.querySelector('.estimated-salary')) ||
          "";

        out.push({
          Company: company,
          Role: role,
          Pay: pay,
          Notes: location ? `Indeed scrape | Location: ${location}` : "Indeed scrape",
          URL: url
        });
      }

      return out;
    });

    console.log(`FOUND raw jobs: ${jobs.length}`);

    const cleanedJobs = jobs
      .map(job => ({
        Company: clean(job.Company),
        Role: clean(job.Role),
        Pay: clean(job.Pay),
        Notes: clean(job.Notes),
        URL: clean(job.URL)
      }))
      .filter(job => job.Role && job.URL);

    console.log(`FOUND usable jobs: ${cleanedJobs.length}`);

    if (cleanedJobs.length > 0) {
      console.log("SAMPLE", JSON.stringify(cleanedJobs.slice(0, 2), null, 2));
    }

    totalExtracted += cleanedJobs.length;

    for (const job of cleanedJobs) {
      const key = `${job.Company}|${job.Role}|${job.URL}`.toLowerCase();

      if (seen.has(key)) {
        totalSkipped++;
        continue;
      }
      seen.add(key);

      await postJob(job);
      totalPosted++;
    }
  }

  console.log(`DONE totalExtracted=${totalExtracted} totalPosted=${totalPosted} totalSkipped=${totalSkipped}`);

  await browser.close();
})();
