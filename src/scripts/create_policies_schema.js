require("dotenv").config();
const ConnectDB = require("../config/db");

async function run() {
  console.log("Starting Policies database schema creation and seeding...");

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
    if (!html) return null;
    let text = html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/li>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<\/div>/gi, "\n\n")
      .replace(/<\/h[1-6]>/gi, "\n\n");
    text = text.replace(/<[^>]*>/g, "");
    text = decodeHtmlEntities(text);
    const lines = text.split("\n").map(line => line.trim());
    return lines.join("\n").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
  }

  try {
    // Drop tables if we want a fresh run to ensure seeding works
    await ConnectDB.query("DROP TABLE IF EXISTS policy_sections;");
    await ConnectDB.query("DROP TABLE IF EXISTS policy_pages;");
    console.log("✓ Dropped existing tables if any.");

    // 1. Create policy_pages table
    await ConnectDB.query(`
      CREATE TABLE IF NOT EXISTS policy_pages (
        page_id INT AUTO_INCREMENT PRIMARY KEY,
        page_key VARCHAR(100) NOT NULL UNIQUE,
        hero_eyebrow VARCHAR(150) DEFAULT NULL,
        hero_title VARCHAR(255) NOT NULL,
        hero_subtitle VARCHAR(500) DEFAULT NULL,
        intro_note TEXT DEFAULT NULL,
        contact_email VARCHAR(255) DEFAULT NULL,
        contact_phone VARCHAR(50) DEFAULT NULL,
        grievance_address TEXT DEFAULT NULL,
        grievance_address_link TEXT DEFAULT NULL,
        need_help_description TEXT DEFAULT NULL,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✓ Table 'policy_pages' created or verified.");

    // 2. Create policy_sections table with indexes built-in
    await ConnectDB.query(`
      CREATE TABLE IF NOT EXISTS policy_sections (
        section_id INT AUTO_INCREMENT PRIMARY KEY,
        page_id INT NOT NULL,
        group_name VARCHAR(100) DEFAULT NULL,
        icon VARCHAR(100) DEFAULT NULL,
        title VARCHAR(255) DEFAULT NULL,
        content LONGTEXT DEFAULT NULL,
        contact_email VARCHAR(255) DEFAULT NULL,
        contact_phone VARCHAR(50) DEFAULT NULL,
        order_no INT NOT NULL DEFAULT 0,
        is_active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP NULL DEFAULT NULL,
        INDEX idx_policy_sections_page (page_id),
        INDEX idx_policy_sections_order (page_id, order_no),
        INDEX idx_policy_sections_active (page_id, is_active),
        CONSTRAINT fk_policy_sections_page
          FOREIGN KEY (page_id)
          REFERENCES policy_pages(page_id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✓ Table 'policy_sections' created or verified.");

    // 3. Seed policy_pages
    const pages = [
      {
        page_key: "shipping-policy",
        hero_eyebrow: "Conditions",
        hero_title: "Shipping Policy",
        hero_subtitle: "Everything you need to know about our shipping and delivery process",
        intro_note: null,
        contact_email: "support@fabricluxure.com",
        contact_phone: "+91 73050 15970",
        grievance_address: null,
        grievance_address_link: null,
        need_help_description: "For any queries related to our shipping policies, contact us:"
      },
      {
        page_key: "terms-and-conditions",
        hero_eyebrow: "Conditions",
        hero_title: "Terms & Conditions",
        hero_subtitle: "Please read these terms carefully before using our services",
        intro_note: null,
        contact_email: "support@fabricluxure.com",
        contact_phone: "+91 73050 15970",
        grievance_address: null,
        grievance_address_link: null,
        need_help_description: "For any queries related to our terms and conditions, contact us:"
      },
      {
        page_key: "cancellation-and-refunds",
        hero_eyebrow: "Conditions",
        hero_title: "Return & Exchange",
        hero_subtitle: "Customer-friendly returns, exchanges, and cancellations",
        intro_note: null,
        contact_email: "support@fabricluxure.com",
        contact_phone: "+91 73050 15970",
        grievance_address: null,
        grievance_address_link: null,
        need_help_description: "For any queries related to our return policies, contact us:"
      },
      {
        page_key: "privacy-policy",
        hero_eyebrow: "Conditions",
        hero_title: "Privacy Policy",
        hero_subtitle: "Your privacy and data security are our top priorities",
        intro_note: `<p>We at <strong>fabricluxure.com</strong> (&quot;VL Global&quot;, &quot;we&quot; or &quot;us&quot;) know that you care how information about you is used and shared and we appreciate your trust in us to do that carefully and sensibly.</p><p>This notice describes the privacy policy of fabricluxure.com. By visiting fabricluxure.com, you are accepting and consenting to the practices described in this Privacy Policy notice.</p>`,
        contact_email: "support@fabricluxure.com",
        contact_phone: "+91 73050 15970",
        grievance_address: "36/11, CHB Colony Street No-04, Velur road, Tiruchengode 637211, Namakkal Dt. Tamil Nadu.",
        grievance_address_link: "https://maps.app.goo.gl/TDbC7gTuZhS57MxS6",
        need_help_description: "For any queries related to our privacy policies, contact us:"
      }
    ];

    const insertedPages = {};
    for (const page of pages) {
      const [result] = await ConnectDB.query(
        `INSERT INTO policy_pages (page_key, hero_eyebrow, hero_title, hero_subtitle, intro_note, contact_email, contact_phone, grievance_address, grievance_address_link, need_help_description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [page.page_key, page.hero_eyebrow, page.hero_title, page.hero_subtitle, stripHtml(page.intro_note), page.contact_email, page.contact_phone, page.grievance_address, page.grievance_address_link, page.need_help_description]
      );
      insertedPages[page.page_key] = result.insertId;
      console.log(`Seeded policy page: ${page.page_key} with ID ${result.insertId}`);
    }

    // 4. Seed policy_sections
    const sections = [];

    // --- SHIPPING POLICY ---
    const shipId = insertedPages["shipping-policy"];
    sections.push(
      {
        page_id: shipId,
        section_type: "note",
        icon: "AlertTriangle",
        title: "Important Warning",
        content: `Customers are requested to provide an accurate, complete, and valid address and pin code at the time of creating an account to avoid any delays. We are not liable for incorrect addresses or delays caused by circumstances beyond our control. No refunds may be claimed for such reasons.`,
        order_no: 1
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: "MapPin",
        title: "Address Information",
        content: `<p><strong>Billing Address</strong> refers to where the customer receives credit card bills, while <strong>Shipping Address</strong> refers to where the order is delivered. Once the order is placed, the shipping address <strong>cannot be changed</strong>.</p><p>If you wish to ship products to multiple addresses, please place separate orders for each address.</p>`,
        order_no: 2
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: "Globe",
        title: "International Orders & Taxes",
        content: `<p>For international customers, all VAT, import duties, and local taxes are borne directly by the customer and must be paid to our courier partner at the time of delivery. These charges vary from country to country and are not governed by us.</p><p>All prices listed on our website are inclusive of GST.</p><p>Custom charges may apply for deliveries outside India, and customers are responsible for paying them directly.</p>`,
        order_no: 3
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: "Truck",
        title: "Shipping Charges",
        content: `<p>Shipping charges for Indian and overseas orders are usually collected during payment. The exact amount will be mentioned on the payment page. If free shipping applies, it will be clearly indicated before payment.</p>`,
        order_no: 4
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: "CheckCircle",
        title: "OTP-Based Delivery",
        content: `<p>We use an <strong>OTP-based delivery system</strong> for secure deliveries. Customers must ensure the OTP is not shared with anyone else and is used only when collecting the order. The package will not be handed over to neighbors, random individuals, or left unattended outside the address.</p><p>Someone must be available to collect the parcel at the delivery location.</p>`,
        order_no: 5
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: "Clock",
        title: "Time to Deliver",
        content: `<ul><li><strong>Major Metro Cities:</strong> 7–10 days from the order confirmation date.</li><li><strong>Other Locations:</strong> 10–15 days from the order confirmation date.</li></ul>`,
        order_no: 6
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: null,
        title: "Delays in Delivery",
        content: `<p>Delivery delays may occur due to factors beyond our control, including travel disruptions, weather conditions, or courier strikes. We will inform you of such delays when possible.</p><p>No refunds, returns, replacements, or exchanges will be entertained for such reasons. In certain cases, shipments may be delivered in parts. Only the unshipped portion can be canceled (where applicable).</p>`,
        order_no: 7
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: null,
        title: "Important Information Regarding Address",
        content: `<ul><li>Any address change requests must be made <strong>within 24 hours</strong> of placing the order.</li><li>No address changes are allowed after 24 hours or once the parcel is shipped.</li><li>Penalties may apply for incorrect addresses or ZIP code mismatches, which must be borne by the customer.</li><li>Reshipment charges, if applicable, will also be the customer’s responsibility.</li></ul>`,
        order_no: 8
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: null,
        title: "Product Availability",
        content: `<p>We make every effort to ensure that products listed on our website are in stock and correctly priced. In the rare event that a product is unavailable, we will inform you within 5 working days from the date of order placement and issue a refund or act according to your instructions.</p>`,
        order_no: 9
      },
      {
        page_id: shipId,
        section_type: "card",
        icon: null,
        title: "Cancellations",
        content: `<p>Order changes or cancellations are only accepted within <strong>24 hours of placement</strong>. Once the order is processed, cancellations cannot be made.</p>`,
        order_no: 10
      },
      {
        page_id: shipId,
        section_type: "contact",
        icon: null,
        title: "Need Help?",
        content: `<p>For any queries related to our shipping policies, contact us:</p>`,
        contact_email: "support@fabricluxure.com",
        contact_phone: "+91 73050 15970",
        order_no: 11
      }
    );

    // --- TERMS & CONDITIONS ---
    const termsId = insertedPages["terms-and-conditions"];
    sections.push(
      {
        page_id: termsId,
        section_type: "card",
        icon: "FileText",
        title: "Terms of Use",
        content: `<p>This document is an electronic record in terms of Information Technology Act, 2000 and rules there under as applicable and the amended provisions pertaining to electronic records in various statutes as amended by the Information Technology Act, 2000. This electronic record is generated by a computer system and does not require any physical or digital signatures.</p><p>For the purpose of these Terms of Use, wherever the context so require &quot;You&quot; shall mean any natural or legal person who has agreed to become a member of the Website by providing Registration Data while registering on the Website as Registered User of Fabric Luxure.</p><p>The customer by accessing / using www.fabricluxure.com as a registered user agrees to be bound by the terms and conditions, policies of our website. Any customer willing to use our website may create an account by providing true, accurate and complete information as to name, address, email, phone number, and thus avail the services.</p>`,
        order_no: 1
      },
      {
        page_id: termsId,
        section_type: "note",
        icon: "AlertTriangle",
        title: "Important Notice",
        content: `<p>Please note that we rely on the information you have provided to us at the time of creating an account for verifying your details and further for delivery purposes and communication of any attractive offers from time to time.</p><p>Fabric Luxure reserves the right to change, amend, modify or update the policies, terms and conditions from time to time, without any notice and the revised terms and conditions would be available on website, hence customers are requested to read the same carefully.</p>`,
        order_no: 2
      },
      {
        page_id: termsId,
        section_type: "card",
        icon: null,
        title: "Third Party Service Providers",
        content: `<p>You agree that the Company may appoint any third party service provider, including but not restricted to one or more of the Company's affiliate to provide backend operations and support as instructed by the Company from time to time including but not limited to collection, processing and remittance of the Transaction Price using the existing authorized banking infrastructure to provide enabling support facility for collection and remittance of payment including but not limited to the Logistics Partner.</p>`,
        order_no: 3
      },
      {
        page_id: termsId,
        section_type: "card",
        icon: null,
        title: "Intellectual Property Rights",
        content: `<p>The domain name <strong>&quot;www.fabricluxure.com&quot;</strong> is controlled and operated by Fabric Luxure Emart (OPC) Private Limited. All material on this site, including images, illustrations, audio clips, and video clips, are protected by copyrights, trademarks, and other intellectual property rights that are owned and controlled by Fabric Luxure Emart (OPC) Private Limited.</p><p>Material on &quot;fabricluxure.com&quot; web site owned, operated, licensed or controlled by Fabric Luxure Emart (OPC) Private Limited is solely for your <strong>personal, non-commercial use</strong>. You must not copy, reproduce, republish, upload, post, transmit or distribute such material in any way, including by email or other electronic means and whether directly or indirectly and you must not assist any other person to do so.</p><div class="bg-bg-light-blue/30 border border-bg-blue/20 p-5 rounded-lg text-sm md:text-lg text-Pinball"><strong>Important:</strong> Without the prior written consent of the owner, modification of the materials, use of the materials on any other web site or networked computer environment or use of the materials for any purpose other than personal, non-commercial use is a violation of the copyrights, trademarks and other proprietary rights and is prohibited. Any use for which you receive any remuneration, whether in money or otherwise, is a commercial use for the purposes of this clause.</div>`,
        order_no: 4
      },
      {
        page_id: termsId,
        section_type: "card",
        icon: "CreditCard",
        title: "Payments",
        content: `<p>The customer can select from respective currencies mentioned on the top right hand side of the page on and check the prices of the products. For customer within India, the prices stated for the products are inclusive of GST and shipping charges, (please refer to our shipping policy).</p><div class="bg-bg-light-blue/30 border border-bg-blue/20 p-5 rounded-lg mb-4 text-sm md:text-lg text-Pinball"><h3 class="font-semibold text-light mb-2">Payment Methods Available:</h3><ul class="list-disc pl-5 space-y-2"><li><strong>Online Payment:</strong> Net banking, debit/credit cards, digital payment apps, UPI IDs through our payment gateway partner ICICI Bank</li><li><strong>Direct Payment:</strong> Bank transfer/NEFT</li></ul></div><p class="text-xs text-Pinball/50 italic mb-4">*Payment gateway partners may be subject to change in future and will be notified accordingly.</p><p><strong>Note:</strong> Gift Vouchers and redemption of the same is available only in our stores, and cannot be availed online.</p>`,
        order_no: 5
      },
      {
        page_id: termsId,
        section_type: "card",
        icon: "Shield",
        title: "Limitation of Liability",
        content: `<p>In no event shall <strong>&quot;Fabric Luxure&quot;</strong> be liable for any special, incidental, indirect or consequential damages of any kind in connection with this agreement, even if &quot;Fabric Luxure&quot; has been informed in advance of the possibility of such damages.</p>`,
        order_no: 6
      },
      {
        page_id: termsId,
        section_type: "card",
        icon: null,
        title: "Product Condition & Exchange",
        content: `<p>Customers who have purchased from us can exchange the products within <strong>7 days</strong> from the date of purchase, only under the following conditions:</p><ul class="list-disc pl-5 text-Pinball text-sm md:text-lg space-y-2 mb-6 leading-relaxed"><li>The product must be returned in their original condition i.e; it must be unused and unworn, with no marks or folds, scent or damage. Please be careful when trying on clothing. (Products with perfumes or body odor are considered used and are not fit for return or exchange).</li><li>Regarding products other than clothing or towels, the package of the product inside the box should not be opened or damaged or used.</li><li>The price tag/label has not been removed</li><li>The order invoice is produced along with the product</li><li>The product can be exchanged with another product of the same price range from same store or any other store in same country</li></ul><div class="bg-red-500/10 border border-red-500/30 p-4 rounded-lg text-sm md:text-lg text-red-300"><strong>Important:</strong> No returns or refunds shall be allowed if the customer is dissatisfied with the color, size, shape, and quality of the product.</div>`,
        order_no: 7
      },
      {
        page_id: termsId,
        section_type: "card",
        icon: null,
        title: "Care Instructions",
        content: `<p><strong>Note:</strong> There is no guarantee with regards to fancy colors. It is advisable to avoid high chemical detergent soaps and wash clothes or towels.</p><p>It is advised to carry out simple hand or machine wash and dry under shades and in case of linen fabrics use a little amount of rice water or starch products available in market to make it look at the best.</p>`,
        order_no: 8
      },
      {
        page_id: termsId,
        section_type: "card",
        icon: "Eye",
        title: "Disclaimer",
        content: `<p>Great care and effort has been taken to present the products in our website to match their original color and grandeur. Since our pictures are of very high quality, it may take some time to download. Please be patient and allow the pictures to get completely downloaded before you can view or order it.</p><p>We always try to minimize color variations between the actual product and that displayed on the screen. However, the colors of the products shown on the web catalogue may vary slightly from the original product due to various reasons like:</p><ul class="list-disc pl-5 text-Pinball text-sm md:text-lg space-y-2 mb-6 leading-relaxed"><li>Variations in monitor resolution levels</li><li>Having a poor VGA card (Display Card)</li><li>Having the minimum color setting in your Monitor Display Properties</li><li>Setting the Brightness and Contrast levels of your monitor to low or high values</li></ul><div class="bg-bg-light-blue/30 border border-bg-blue/20 p-5 rounded-lg text-sm md:text-lg text-Pinball"><h3 class="font-semibold text-light mb-2">Recommended Color Settings</h3><ul class="list-disc pl-5 space-y-1"><li>Set the Screen Resolution to <strong>1366×768 pixels minimum</strong></li><li>Make your Monitor support more than 256 colors, by changing the Display settings</li><li>Set your Monitor Brightness value to <strong>75% of Maximum value</strong></li><li>Set your Monitor Contrast value to <strong>85% of Maximum value</strong></li></ul></div>`,
        order_no: 9
      },
      {
        page_id: termsId,
        section_type: "contact",
        icon: null,
        title: "Questions About Our Terms?",
        content: `<p>We're here to help clarify anything you need:</p>`,
        contact_email: "support@fabricluxure.com",
        contact_phone: "+91 73050 15970",
        order_no: 10
      }
    );

    // --- CANCELLATION & REFUNDS ---
    const cancelId = insertedPages["cancellation-and-refunds"];
    sections.push(
      {
        page_id: cancelId,
        section_type: "group",
        icon: "XCircle",
        title: "Cancellation Policy",
        content: `<div class="space-y-4"><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">1</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">If unfortunately you have to cancel an order, kindly do so <strong>before your order is shipped</strong>. Please log into your account and click on &quot;cancel order&quot; option against the order number that you want to cancel.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">2</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">If you cancel your order before it is shipped, we will <strong>refund you the entire amount</strong>.</p></div></div>`,
        order_no: 1
      },
      {
        page_id: cancelId,
        section_type: "group",
        icon: "RotateCcw",
        title: "Return Policy",
        content: `<div class="space-y-5"><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">1</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">If you think you have received the product in a bad condition or if the packaging is tampered with or damaged before delivery, please <strong>refuse to accept the package</strong> and return the package to the delivery person. Also, please email us at fabricluxure@gmail.com or WhatsApp to 9944944255 mentioning your Order ID and details and we will respond in 24 to 48 hours.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">2</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">We will personally ensure that a brand new replacement is issued to you with <strong>no additional cost</strong>.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">3</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">If you do not like the product, you will have to raise a return request from your account. You can log in to your account if you already have one or create a new one using the same email id which is used while placing the order.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">4</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">Return request will <strong>not be accepted</strong> through any other medium like email, Facebook/Instagram chat or phone call.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">5</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">In case due to certain circumstances after raising the return request within 48 hours you are unable to return the shipment within the time frame, no refund would be made. Only <strong>credit note</strong> would be given.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">6</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">When you return the product to the courier, it is <strong>mandatory to take a receipt</strong> (physical or through message). In case of lost shipment we will need the proof of return by you.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">7</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">Refund would be processed within <strong>4-7 days</strong> after the product is received back to our Warehouse.</p></div></div>`,
        order_no: 2
      },
      {
        page_id: cancelId,
        section_type: "card",
        icon: "AlertTriangle",
        title: "Products Not Eligible for Return or Replacement",
        content: `<ul class="list-disc pl-5 text-Pinball text-sm md:text-lg space-y-2 leading-relaxed"><li>Any product that exhibits physical damage to the product</li><li>If the product is customized for you</li><li>If the Return or Exchange is requested after 48 hours of receiving the shipment</li><li>If the product is made to order</li></ul>`,
        order_no: 3
      },
      {
        page_id: cancelId,
        section_type: "group",
        icon: "RefreshCw",
        title: "Exchange Policy",
        content: `<div class="space-y-4"><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">1</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">We don't exchange the products unless the product is damaged or wrongly sent to you. You have to raise an exchange request <strong>within 2 days</strong> of receiving the product. You can login to your account or create a new one using the email id which is used while placing the order. Send it by courier or post and share the receipt to our mail id fabricluxure@gmail.com</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">2</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">Once we have it with us, we will ship the replacement product to you within <strong>5-7 working days</strong>.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">3</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">Exchange not possible if the product is stitched or altered from your side.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">4</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">Exchange would not be accepted if the product is customized for you.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">5</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">If you want to exchange your product with another product of lower amount, we would ship the product once we receive it and the balance would be given in the form of <strong>credit note</strong>.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">6</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">Return or exchange of the exchanged product is not possible.</p></div><div class="flex items-start gap-4"><div class="w-6 h-6 rounded-full bg-bg-light-blue border border-bg-blue/40 flex items-center justify-center shrink-0 mt-0.5 text-xs font-semibold text-brown font-mono">7</div><p class="text-Pinball text-sm md:text-lg leading-relaxed">No discount will be given on exchange orders.</p></div></div>`,
        order_no: 4
      },
      {
        page_id: cancelId,
        section_type: "card",
        icon: "Globe",
        title: "International Orders",
        content: `<div class="space-y-4 text-Pinball text-sm md:text-lg leading-relaxed"><p>• If unfortunately you wish to cancel the order, please do it before your order gets shipped.</p><p>• If you cancel your order before your order gets shipped, we will refund the amount with <strong>5% deduction</strong> from the whole amount as there will be PayPal transaction fee charged.</p><p>• Once we receive the products, strict quality check would be done by our team. Please make sure that the original packing is intact when you courier it back to us.</p><p>• The amount refunded to you would be only for the products.</p><p>• We unfortunately do not have exchange policy for international customers.</p><p>• Once the product goes into customization process, the order cannot be cancelled.</p><p>• For Returns - Freight charges and custom duty to be borne by the customer.</p></div>`,
        order_no: 5
      },
      {
        page_id: cancelId,
        section_type: "contact",
        icon: null,
        title: "Need Assistance?",
        content: `<p>Have questions about returns or exchanges?</p>`,
        contact_email: "support@fabricluxure.com",
        contact_phone: "+91 73050 15970",
        order_no: 6
      }
    );

    // --- PRIVACY POLICY ---
    const privId = insertedPages["privacy-policy"];
    sections.push(
      {
        page_id: privId,
        section_type: "card",
        icon: "UserCheck",
        title: "Controller of Your Data",
        content: `<p>The Indian company, <strong>Fabric luxure</strong> is the controller of the personal data you submit to us and responsible for your personal data under applicable data protection law.</p>`,
        order_no: 1
      },
      {
        page_id: privId,
        section_type: "card",
        icon: "Database",
        title: "Types of Information We Gather",
        content: `<p>We at Fabric Luxure recognize your right to confidentiality and are committed to your privacy. Fabric Luxure does not furnish any identifiable information at the individual level regarding its customers to any third party.</p><p>The information you give to us is held with the utmost care and security. This information is collected primarily to ensure that we are able to fulfill your requirements and to deliver you a truly personalized shopping experience.</p><div class="bg-bg-light-blue/30 border border-bg-blue/20 p-5 rounded-lg text-sm md:text-lg text-Pinball mb-4"><h3 class="font-bold text-light mb-2">Information You Give Us</h3><p class="leading-relaxed mb-2">We receive and store any information you enter on our website or give us in any other way. We will always process your email address and password that you submit to us when you sign up for an account on fabricluxure.com.</p><p class="leading-relaxed">You can choose not to provide certain information but then you might not be able to take advantage of many of our features. We use the information that you provide for such purposes as responding to your requests, customizing future shopping for you, improving our platform, and communicating with you.</p></div><div class="bg-bg-light-blue/30 border border-bg-blue/20 p-5 rounded-lg text-sm md:text-lg text-Pinball"><h3 class="font-bold text-light mb-2">Automatic Information</h3><p class="leading-relaxed">We receive and store certain types of information whenever you interact with us. Like many websites, we use &quot;cookies&quot; and we obtain certain types of information when your web browser accesses fabricluxure.com or advertisements and other content served by or on behalf of fabricluxure.com on other websites. We may use this information for internal analysis and to provide you with location-based services, such as advertising, search results, and other personalized content.</p></div>`,
        order_no: 2
      },
      {
        page_id: privId,
        section_type: "card",
        icon: "Eye",
        title: "Use of Information About You",
        content: `<p>The information we learn from customers helps us personalize and continually improve your shopping experience at fabricluxure.com in the following manner:</p><ul class="list-disc pl-5 text-Pinball text-sm md:text-lg space-y-2 leading-relaxed"><li>We use the information to improve our platform, prevent or detect fraud or abuses of our website.</li><li>We will use the information to provide you with your order history, details around your orders and enable you to handle your account settings.</li><li>We use the information that you provide for such purposes as responding to your requests, customizing future shopping for you and communicating with you.</li><li>We may use the information for internal analysis and to provide you with location-based services, such as advertising, search results, and other personalized content.</li><li>We will enable you to save items in your shopping bag, offer you size recommendations and enable you to rate and review the products you've purchased from us.</li></ul>`,
        order_no: 3
      },
      {
        page_id: privId,
        section_type: "card",
        icon: null,
        title: "Legal Ground to Process Data",
        content: `<p>Processing your personal data is necessary for Fabric Luxure to fulfill the service of managing and delivering the order to you. It is based on your consent when you create your account and on our legitimate interest to provide relevant product information.</p>`,
        order_no: 4
      },
      {
        page_id: privId,
        section_type: "card",
        icon: null,
        title: "Duration for Which Data is Saved",
        content: `<p>We will keep your data for as long as you have an active Fabric Luxure account. You have the right to terminate your account at any time. We will keep your personal data if there are any legal requirements and if there is an open dispute.</p>`,
        order_no: 5
      },
      {
        page_id: privId,
        section_type: "card",
        icon: "Key",
        title: "Cookies",
        content: `<p>'Cookies' are alphanumeric identifiers that are stored on your computer's hard drive through your web browser to enable our systems to recognize your browser and to provide features such as Recommended for you, personalized advertisements on other websites, etc.</p><p>A cookie file cannot be executed as code or deliver virus. Our cookies do not contain any personally identifying information, but they do enable us to identify you in case you have visited us earlier and to store items in your shopping cart between visits.</p><div class="bg-bg-light-blue/30 border border-bg-blue/20 p-5 rounded-lg text-sm md:text-lg text-Pinball"><strong>Important:</strong> Most web browsers automatically accept cookies, but you can set your browser to notify you when you receive a cookie. However, without a cookie, you will not be able to use most of the features in our website, including placing items in your shopping cart and purchasing them.</div>`,
        order_no: 6
      },
      {
        page_id: privId,
        section_type: "card",
        icon: "Lock",
        title: "Security of Information",
        content: `<p>When you place an order for a product, we offer the use of a secure server. The <strong>Secure Socket Layer (SSL)</strong> encrypts all the information you input before it is sent to us. This prevents your personal data from being interpreted even if hacked while submitting it to our server.</p><p>At the time of submitting your Credit Card details you will be redirected to a Highly Secure Payment server where VL Global or its associates have no access to your information. We will not disclose any sort of personally identifiable information except when you give us requisite permission or under special circumstances such as when the law requires it.</p>`,
        order_no: 7
      },
      {
        page_id: privId,
        section_type: "card",
        icon: null,
        title: "Use of fabricluxure.com by Children",
        content: `<p>Use of fabricluxure.com is available only to persons who can form a legally binding contract under the Indian Contract Act, 1872. If you are a minor i.e. under the age of 18 years, you may use fabricluxure.com only with the involvement of a parent or guardian.</p>`,
        order_no: 8
      },
      {
        page_id: privId,
        icon: null,
        title: "Grievance Officer",
        content: "In accordance with the Information Technology Act, 2000\n\nFabric Luxure A Brand Owned By\nVIJAYLAKSHMI GLOBAL EMART (OPC) PRIVATE LIMITED\n\nMonday to Friday | 9:30 AM to 8:30 PM",
        contact_email: null,
        contact_phone: null,
        order_no: 9
      }
    );

    // Insert all sections
    for (const sec of sections) {
      await ConnectDB.query(
        `INSERT INTO policy_sections (page_id, icon, title, content, contact_email, contact_phone, order_no) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [sec.page_id, sec.icon, sec.title, stripHtml(sec.content), sec.contact_email, sec.contact_phone, sec.order_no]
      );
    }

    console.log(`✓ Seeded ${sections.length} policy sections successfully.`);
    console.log("Seeding complete! Exiting...");
    process.exit(0);
  } catch (error) {
    console.error("❌ Schema & Seeding Error:", error);
    process.exit(1);
  }
}

run();
