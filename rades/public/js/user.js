frappe.ui.form.on("User", {
	first_name: frm => {
		name = frm.doc.first_name ? capitalize(frm.doc.first_name) : ""; 
		frm.set_value("first_name", name); 
		frm.trigger("create_username");
	},
	last_name: frm => {
		name = frm.doc.last_name ? capitalize(frm.doc.last_name) : ""; 
		frm.set_value("last_name", name); 
		frm.trigger("create_username");
	},
	email: frm => {
		email = frm.doc.email ? frm.doc.email.toLowerCase() : ""; 
		frm.set_value("email", email);
	},
	create_username: frm => {
		let {first_name, last_name} = frm.doc;

		fname = first_name.replace(" ", "_") || "";
		lname = last_name.replace(" ", "_")  || "";
		frm.set_value("username", `${fname}_${lname}`);
	}
})

function capitalize(str){
	str = str.trim();
	if (!str)
		return ""
	return str.toLowerCase().replace(/^\w/, c => c.toUpperCase());
}