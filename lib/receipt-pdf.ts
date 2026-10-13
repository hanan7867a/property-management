type ReceiptPdfDetails = {
  title: string;
  subtitle: string;
  reference: string;
  rows?: [string, string][];
  companyName?: string;
  headerFields?: [string, string][];
  sections?: {
    title: string;
    rows?: [string, string][];
    table?: {
      headers: [string, string];
      rows: [string, string][];
      total?: [string, string];
    };
  }[];
};

function joinBytes(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function makePdf(jpeg: Uint8Array, width: number, height: number): Blob {
  const encoder = new TextEncoder();
  const pageWidth = 450;
  const pageHeight = Math.round(height * pageWidth / width);
  const pageContent = encoder.encode(`q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im0 Do\nQ`);
  const objects: Uint8Array[] = [
    encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
    encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
    encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
    joinBytes([
      encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`),
      jpeg,
      encoder.encode("\nendstream"),
    ]),
    joinBytes([encoder.encode(`<< /Length ${pageContent.length} >>\nstream\n`), pageContent, encoder.encode("\nendstream")]),
  ];
  const parts: Uint8Array[] = [encoder.encode("%PDF-1.4\n")];
  const offsets = [0];
  let offset = parts[0].length;

  objects.forEach((object, index) => {
    offsets.push(offset);
    const wrapped = joinBytes([
      encoder.encode(`${index + 1} 0 obj\n`),
      object,
      encoder.encode("\nendobj\n"),
    ]);
    parts.push(wrapped);
    offset += wrapped.length;
  });

  const xrefOffset = offset;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((objectOffset) => `${String(objectOffset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`,
  ].join("");
  parts.push(encoder.encode(xref));
  const pdfBytes = joinBytes(parts);
  const pdfBuffer = new ArrayBuffer(pdfBytes.length);
  new Uint8Array(pdfBuffer).set(pdfBytes);
  return new Blob([pdfBuffer], { type: "application/pdf" });
}

export async function createReceiptPdf(details: ReceiptPdfDetails): Promise<Blob> {
  if (typeof document === "undefined") {
    throw new Error("PDF receipts can only be created in a browser.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  const sections = details.sections;
  const contentRows = sections
    ? sections.reduce((total, section) => total + (section.rows?.length ?? 0) + (section.table?.rows.length ?? 0) + (section.table?.total ? 1 : 0), 0)
    : details.rows?.length ?? 0;
  canvas.height = Math.max(1600, 680 + contentRows * 112 + (sections?.length ?? 0) * 100);
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not prepare the receipt PDF.");
  }

  context.fillStyle = "#f1f5f9";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#172554";
  context.fillRect(0, 0, canvas.width, 300);
  context.fillStyle = "#bfdbfe";
  context.font = "bold 25px Arial, sans-serif";
  context.fillText(details.companyName ?? details.subtitle, 78, 64, 1044);
  context.fillStyle = "#ffffff";
  context.font = "bold 45px Arial, sans-serif";
  context.fillText(details.title.toUpperCase(), 78, 132, 1044);
  context.fillStyle = "#dbeafe";
  context.font = "23px Arial, sans-serif";
  context.fillText(details.reference, 78, 180, 1044);
  let y = 218;
  if (details.headerFields?.length) {
    const columnWidth = 1044 / details.headerFields.length;
    details.headerFields.forEach(([label, value], index) => {
      const x = 78 + index * columnWidth;
      context.fillStyle = "#bfdbfe";
      context.font = "bold 17px Arial, sans-serif";
      context.fillText(label.toUpperCase(), x, y, columnWidth - 18);
      context.fillStyle = "#ffffff";
      context.font = "bold 23px Arial, sans-serif";
      context.fillText(value, x, y + 34, columnWidth - 18);
    });
  }
  y = 340;
  const wrapText = (text: string, maxWidth: number, font: string) => {
    context.font = font;
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && context.measureText(candidate).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = candidate;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  const drawDataRows = (rows: [string, string][], highlightLast = false) => {
    const left = 96;
    const right = 1104;
    const valueX = 560;
    rows.forEach(([label, value], index) => {
      const labelFont = "22px Arial, sans-serif";
      const valueFont = "bold 23px Arial, sans-serif";
      const labelLines = wrapText(label, 420, labelFont);
      const valueLines = wrapText(value, 510, valueFont);
      const rowHeight = Math.max(72, Math.max(labelLines.length, valueLines.length) * 31 + 28);
      context.fillStyle = highlightLast && index === rows.length - 1 ? "#dbeafe" : index % 2 === 0 ? "#ffffff" : "#f8fafc";
      context.fillRect(72, y, 1056, rowHeight);
      context.fillStyle = "#475569";
      context.font = labelFont;
      labelLines.forEach((line, lineIndex) => context.fillText(line, left, y + 42 + lineIndex * 29, 430));
      context.fillStyle = "#0f172a";
      context.font = valueFont;
      valueLines.forEach((line, lineIndex) => context.fillText(line, valueX, y + 42 + lineIndex * 29, right - valueX));
      y += rowHeight;
    });
  };
  if (sections?.length) {
    sections.forEach((section) => {
      y += 16;
      context.fillStyle = "#e2e8f0";
      context.fillRect(72, y, 1056, 58);
      context.fillStyle = "#172554";
      context.font = "bold 25px Arial, sans-serif";
      context.fillText(section.title.toUpperCase(), 96, y + 38, 1008);
      y += 58;
      if (section.rows?.length) drawDataRows(section.rows, section.title === "Payment Summary");
      if (section.table) {
        const table = section.table;
        const tableLeft = 72;
        const tableWidth = 1056;
        const categoryWidth = 700;
        const amountWidth = tableWidth - categoryWidth;
        context.fillStyle = "#334155";
        context.fillRect(tableLeft, y, tableWidth, 62);
        context.fillStyle = "#ffffff";
        context.font = "bold 20px Arial, sans-serif";
        context.textAlign = "left";
        context.fillText(table.headers[0], tableLeft + 24, y + 40, categoryWidth - 44);
        context.textAlign = "right";
        context.fillText(table.headers[1], tableLeft + categoryWidth - 20, y + 40, amountWidth - 28);
        y += 62;
        table.rows.forEach(([category, amount], rowIndex) => {
          context.fillStyle = rowIndex % 2 === 0 ? "#ffffff" : "#f8fafc";
          context.fillRect(tableLeft, y, tableWidth, 62);
          context.fillStyle = "#334155";
          context.font = "21px Arial, sans-serif";
          context.textAlign = "left";
          context.fillText(category, tableLeft + 24, y + 40, categoryWidth - 44);
          context.textAlign = "right";
          context.font = "bold 21px Arial, sans-serif";
          context.fillText(amount, tableLeft + categoryWidth - 20, y + 40, amountWidth - 28);
          y += 62;
        });
        if (table.total) {
          context.fillStyle = "#dbeafe";
          context.fillRect(tableLeft, y, tableWidth, 68);
          context.fillStyle = "#172554";
          context.font = "bold 22px Arial, sans-serif";
          context.textAlign = "left";
          context.fillText(table.total[0], tableLeft + 24, y + 44, categoryWidth - 44);
          context.textAlign = "right";
          context.fillText(table.total[1], tableLeft + categoryWidth - 20, y + 44, amountWidth - 28);
          y += 68;
        }
        context.textAlign = "left";
      }
    });
  } else {
    drawDataRows(details.rows ?? []);
  }
  context.textAlign = "center";
  context.fillStyle = "#64748b";
  context.font = "20px Arial, sans-serif";
  context.fillText("Thank you. Keep this receipt for your records.", 600, canvas.height - 55, 1040);

  const jpegBlob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Could not render the receipt PDF.")), "image/jpeg", 0.92);
  });
  return makePdf(new Uint8Array(await jpegBlob.arrayBuffer()), canvas.width, canvas.height);
}
