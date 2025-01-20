// Markdown Report Generator
class MarkdownReport {
    constructor(title) {
        this.title = title || "Untitled Report";
        this.content = [];
    }

    // Add a section with a title
    addSection(title) {
        const section = `\n## ${title}\n`;
        this.content.push(section);
    }

    // Add a list to the report (unordered or ordered)
    addList(items, ordered = false) {
        const list = items.map((item, index) => 
            ordered ? `${index + 1}. ${item}` : `- ${item}`
        ).join("\n");

        this.content.push(`\n${list}\n`);
    }

    // Add plain text content
    addText(content) {
        this.content.push(`\n${content}\n`);
    }

    // Generate the final Markdown content
    generate() {
        const header = `# ${this.title}\n`;
        return header + this.content.join("\n");
    }
}

module.exports = MarkdownReport;
