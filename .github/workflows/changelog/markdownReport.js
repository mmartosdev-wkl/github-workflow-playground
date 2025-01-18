// Markdown Report Generator
class MarkdownReport {
    constructor(title) {
        this.title = title || "Untitled Report";
        this.sections = [];
    }

    // Add a section with a title and content
    addSection(title, content) {
        const section = `\n## ${title}\n\n${content}\n`;
        this.sections.push(section);
    }

    // Add a list to the report (unordered or ordered)
    addList(items, ordered = false) {
        const list = items.map((item, index) => 
            ordered ? `${index + 1}. ${item}` : `- ${item}`
        ).join("\n");

        this.sections.push(`\n${list}\n`);
    }

    // Add a table to the report
    addTable(headers, rows) {
        const headerRow = `| ${headers.join(" | ")} |`;
        const dividerRow = `| ${headers.map(() => "---").join(" | ")} |`;
        const dataRows = rows.map(row => `| ${row.join(" | ")} |`).join("\n");
        
        const table = `\n${headerRow}\n${dividerRow}\n${dataRows}\n`;
        this.sections.push(table);
    }

    // Add plain text content
    addText(content) {
        this.sections.push(`\n${content}\n`);
    }

    // Generate the final Markdown content
    generate() {
        const header = `# ${this.title}\n`;
        return header + this.sections.join("\n");
    }
}

module.exports = MarkdownReport;

