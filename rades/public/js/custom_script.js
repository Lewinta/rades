frappe.ui.form.on("Custom Script", {
    refresh: (frm) => {
        $('pre code').each((i, block) => {
            hljs.highlightBlock(block);
        });
    }
});