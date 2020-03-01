frappe.ui.form.on("Item", {
    refresh: frm => {
        frm.trigger("hide_dashboard");
    },
    item_code: frm => {
        if (!frm.doc.item_code)
            return
        let code = frm.doc.item_code.trim().replace("  "," ").toUpperCase();
        frm.set_value("item_code", code);
    },
    hide_dashboard: frm =>{
        frm.dashboard.wrapper.parent().addClass("hide")
            .parent().find(".section-head").addClass("collapsed")
            .find(".octicon.collapse-indicator.octicon-chevron-up")
            .removeClass()
            .addClass("octicon collapse-indicator octicon-chevron-down");
    },
});