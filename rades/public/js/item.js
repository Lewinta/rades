frappe.ui.form.on("Item", {
    refresh: function(frm) {
        frm.trigger("hide_dashboard");
    },
    "hide_dashboard": function(frm) {
        frm.dashboard.wrapper.parent().addClass("hide")
            .parent().find(".section-head").addClass("collapsed")
            .find(".octicon.collapse-indicator.octicon-chevron-up")
            .removeClass()
            .addClass("octicon collapse-indicator octicon-chevron-down");
    },
});