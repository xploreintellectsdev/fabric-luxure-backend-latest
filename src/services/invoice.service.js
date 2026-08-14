const PDFDocument = require('pdfkit');

/**
 * Format custom measurement string/object
 */
const formatCustomMeasurement = (val) => {
  if (!val) return "";
  try {
    let parsed = val;
    if (typeof val === "string") {
      parsed = JSON.parse(val);
    }
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed)
        .filter(([k, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => `${k.replace("_", " ")}: ${v}`)
        .join(", ");
    }
  } catch (e) { }
  return String(val);
};

/**
 * Generate A4 Invoice PDF Buffer using PDFKit
 * @param {Object} orderData
 * @returns {Promise<Buffer>}
 */
const generateInvoicePdf = (orderData) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const buffers = [];

      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', () => {
        const pdfData = Buffer.concat(buffers);
        resolve(pdfData);
      });
      doc.on('error', reject);

      // --- Header ---
      doc.fillColor('#334155').fontSize(20).font('Helvetica-Bold').text('FABRIC LUXURE', { uppercase: true });
      doc.fontSize(10).fillColor('#64748b').font('Helvetica').text('Premium fabrics & Custom tailoring');
      doc.text('support@fabricluxure.com | www.fabricluxure.com');

      doc.moveUp(3);
      doc.fontSize(16).fillColor('#334155').font('Helvetica-Bold').text('ORDER INVOICE', { align: 'right', uppercase: true });
      doc.fontSize(10).fillColor('#334155').font('Helvetica-Bold').text(`Order ID: ${orderData.order_number}`, { align: 'right' });
      doc.fillColor('#64748b').font('Helvetica').text(`Date: ${new Date(orderData.created_at).toLocaleDateString()}`, { align: 'right' });
      doc.fillColor('#334155').font('Helvetica-Bold').text(`Payment Status: ${String(orderData.payment_status).toUpperCase()}`, { align: 'right' });

      doc.moveDown(2);

      // Draw a line
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#e2e8f0').stroke();
      doc.moveDown(1);

      // --- Billing & Shipping ---
      const address = orderData.address || {};
      const startY = doc.y;

      // Customer Details
      doc.fontSize(10).fillColor('#334155').font('Helvetica-Bold').text('CUSTOMER DETAILS', 50, startY);
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fillColor('#0f172a').text(orderData.customer_name || "N/A");
      doc.font('Helvetica').fillColor('#475569').text(`Email: ${orderData.customer_email || "N/A"}`);
      doc.text(`Phone: ${orderData.customer_phone || "N/A"}`);

      // Delivery Address
      doc.fontSize(10).fillColor('#334155').font('Helvetica-Bold').text('DELIVERY ADDRESS', 300, startY);
      doc.moveDown(0.5);
      if (address.fullName || address.full_name) {
        doc.font('Helvetica-Bold').fillColor('#0f172a').text(address.fullName || address.full_name, 300, doc.y);
        doc.font('Helvetica').fillColor('#475569').text(`Phone: ${address.mobile || "N/A"}`, 300, doc.y);
        doc.text(address.houseBuilding || address.house_building, 300, doc.y);
        doc.text(address.streetLocality || address.street_locality, 300, doc.y);
        if (address.landmark) {
          doc.text(`Landmark: ${address.landmark}`, 300, doc.y);
        }
        doc.text(`${address.city}, ${address.state} - ${address.postalCode || address.postal_code}`, 300, doc.y);
      } else {
        doc.font('Helvetica-Oblique').fillColor('#94a3b8').text('No delivery address details.', 300, doc.y);
      }

      doc.moveDown(2);

      // Ensure we start a new line for the table
      let tableTop = doc.y;
      if (tableTop > 700) {
        doc.addPage();
        tableTop = 50;
      }

      // --- Table Header ---
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#334155');
      doc.rect(50, tableTop, 495, 20).fill('#f1f5f9');
      doc.fillColor('#334155').text('ITEM DESCRIPTION', 55, tableTop + 5);
      doc.text('SPECIFICATIONS', 220, tableTop + 5);
      doc.text('QTY', 390, tableTop + 5, { width: 30, align: 'center' });
      doc.text('PRICE', 430, tableTop + 5, { width: 50, align: 'right' });
      doc.text('TOTAL', 490, tableTop + 5, { width: 50, align: 'right' });

      let position = tableTop + 25;

      // --- Table Rows ---
      doc.font('Helvetica').fontSize(9);
      if (orderData.products && Array.isArray(orderData.products)) {
        orderData.products.forEach((item) => {
          let specString = "";
          if (item.fit_style) specString += `Fit: ${item.fit_style}\n`;
          if (item.selected_size) specString += `Size: ${item.selected_size}\n`;
          if (item.selected_length) specString += `Length: ${item.selected_length}\n`;
          if (item.selected_sleeve) specString += `Sleeve: ${item.selected_sleeve}\n`;
          if (item.custom_measurement) specString += `Custom: ${formatCustomMeasurement(item.custom_measurement)}\n`;
          if (item.monogram) {
            specString += `\nMonogram Details:\n`;
            if (item.monogram.upload_file) {
              specString += `Custom Uploaded Design\n`;
            } else {
              specString += `Text: ${item.monogram.text || ''}\n`;
              specString += `Placement: ${item.monogram.placement || ''}\n`;
              specString += `Color: ${item.monogram.color || ''}\n`;
              specString += `Font: ${item.monogram.font || ''}\n`;
            }
            if (item.monogram.price !== undefined) specString += `Price: Rs. ${Number(item.monogram.price).toLocaleString()}`;
          }

          specString = specString.trim();

          const unitPrice = Number(item.price) + Number(item.monogram?.price || 0);
          const totalPrice = unitPrice * Number(item.quantity);

          const productNameHeight = doc.heightOfString(item.product_name || 'N/A', { width: 155 });
          const specHeight = specString ? doc.heightOfString(specString, { width: 160 }) : 10;
          const rowHeight = Math.max(productNameHeight, specHeight) + 15;

          if (position + rowHeight > 750) {
            doc.addPage();
            position = 50;
          }

          doc.fillColor('#0f172a').font('Helvetica-Bold').text(item.product_name || 'N/A', 55, position, { width: 155 });
          doc.fillColor('#475569').font('Helvetica').text(specString, 220, position, { width: 160 });
          doc.fillColor('#0f172a').text(String(item.quantity || 1), 390, position, { width: 30, align: 'center' });
          doc.text(`Rs. ${unitPrice.toLocaleString()}`, 430, position, { width: 50, align: 'right' });
          doc.font('Helvetica-Bold').text(`Rs. ${totalPrice.toLocaleString()}`, 490, position, { width: 50, align: 'right' });

          doc.moveTo(50, position + rowHeight - 5).lineTo(545, position + rowHeight - 5).strokeColor('#e2e8f0').stroke();

          position += rowHeight;
        });
      }

      // --- Totals ---
      doc.y = position;
      doc.moveDown(1.5);

      if (doc.y > 650) {
        doc.addPage();
      }

      doc.font('Helvetica').fontSize(10).fillColor('#334155');

      let currentTotalY = doc.y;

      const drawTotalLine = (label, value, bold = false) => {
        if (bold) doc.font('Helvetica-Bold').fillColor('#0f172a');
        else doc.font('Helvetica').fillColor('#475569');

        doc.text(label, 350, currentTotalY, { width: 100, align: 'left' });
        doc.text(value, 460, currentTotalY, { width: 85, align: 'right' });
        currentTotalY += 15;
      };

      drawTotalLine('Subtotal', `Rs. ${Number(orderData.subtotal || 0).toLocaleString()}`);
      drawTotalLine('GST', 'Included', true);
      if (Number(orderData.stitching_amount) > 0) {
        drawTotalLine('Stitching Charge', `Rs. ${Number(orderData.stitching_amount).toLocaleString()}`);
      }
      drawTotalLine('Shipping', Number(orderData.shipping_amount) === 0 ? "FREE" : `Rs. ${Number(orderData.shipping_amount).toLocaleString()}`);

      currentTotalY += 5;
      doc.moveTo(350, currentTotalY).lineTo(545, currentTotalY).strokeColor('#e2e8f0').stroke();
      currentTotalY += 10;

      doc.fontSize(12);
      drawTotalLine('Grand Total', `Rs. ${Number(orderData.grand_total || 0).toLocaleString()}`, true);

      // --- Footer ---
      doc.fontSize(9).fillColor('#94a3b8').font('Helvetica');
      doc.text('Thank you for shopping with Fabric Luxure!', 50, 780, { align: 'center', width: 495 });
      doc.text('This is a computer generated invoice and does not require signature.', 50, 792, { align: 'center', width: 495 });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateInvoicePdf,
};
