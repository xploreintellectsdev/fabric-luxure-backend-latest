require("dotenv").config();
const ConnectDB = require("../config/db");

// Decodes common HTML entities
function decodeHtmlEntities(str) {
  if (!str) return "";
  return str
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot/g, '"')
    .replace(/&amp/g, '&')
    .replace(/&lt/g, '<')
    .replace(/&gt/g, '>');
}

// Converts HTML to clean plain text preserving paragraph and list structure
function stripHtml(html) {
  if (!html) return "";

  // 1. Replace list items and line breaks with single newlines
  let text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/div>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n");

  // 2. Remove all other HTML tags
  text = text.replace(/<[^>]*>/g, "");

  // 3. Decode HTML entities
  text = decodeHtmlEntities(text);

  // 4. Normalize lines (trim each line, remove excess newlines)
  const lines = text.split("\n").map(line => line.trim());
  
  // Join back and replace any instances of 3 or more consecutive newlines with 2 newlines (for paragraphs)
  let result = lines.join("\n")
    .replace(/\r/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return result;
}

async function run() {
  console.log("Starting HTML tag cleanup for policy sections...");

  try {
    // 1. Fetch all policy sections
    const [sections] = await ConnectDB.query("SELECT section_id, title, content FROM policy_sections");
    console.log(`Found ${sections.length} policy sections to clean.`);

    let updatedCount = 0;

    // 2. Loop through and clean HTML content
    for (const sec of sections) {
      if (sec.content) {
        const cleanContent = stripHtml(sec.content);
        
        // Update DB
        await ConnectDB.query(
          "UPDATE policy_sections SET content = ? WHERE section_id = ?",
          [cleanContent, sec.section_id]
        );
        updatedCount++;
      }
    }

    // 3. Also clean any intro notes on policy pages
    const [pages] = await ConnectDB.query("SELECT page_id, hero_title, intro_note FROM policy_pages");
    console.log(`Found ${pages.length} policy pages to check for intro notes.`);
    for (const page of pages) {
      if (page.intro_note) {
        const cleanIntro = stripHtml(page.intro_note);
        await ConnectDB.query(
          "UPDATE policy_pages SET intro_note = ? WHERE page_id = ?",
          [cleanIntro, page.page_id]
        );
        console.log(`✓ Cleaned intro note for page: ${page.hero_title}`);
      }
    }

    console.log(`✓ Successfully updated ${updatedCount} policy sections with clean plain text.`);
    console.log("Cleanup complete! Exiting...");
    process.exit(0);
  } catch (error) {
    console.error("❌ Cleanup Error:", error);
    process.exit(1);
  }
}

run();
