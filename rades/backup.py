import frappe

import os
from datetime import datetime

def daily():
	db_name = "rades"

	os.chdir("/home/frappe/frappe-bench/backups/{}".format(db_name))

	now = datetime.now()

	date_format = now.strftime("%Y_%m_%d_%H%M")

	formatted_name = "{}_{}.sql".format(db_name, date_format)

	os.system("mysqldump --user=root --password=P@ssword2017 {} > {}".format(db_name, formatted_name))
	os.chdir("/home/frappe/frappe-bench/sites")