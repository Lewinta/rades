import frappe

import os
from datetime import datetime
from frappe.utils import add_months, nowdate

def daily():

	db_name = "rades"

	os.chdir("/home/frappe/frappe-bench/backups/{}".format(db_name))

	now = datetime.now()
	previous_bk = add_months(nowdate(), -1).replace('-','_') 
	date_format = now.strftime("%Y_%m_%d_%H%M")

	formatted_name = "{}_{}.sql".format(db_name, date_format)

	os.system("mysqldump --user=root --password=P@ssword2017 {} > {}".format(db_name, formatted_name))
	# Let's compress the .sql file
	os.system("xz -9 {}".format(formatted_name))
	# Let's delete previous month files
	os.system("rm -f {}_{}*.xz".format(db_name, previous_bk))

	os.chdir("/home/frappe/frappe-bench/sites")