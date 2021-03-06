// Copyright (c) 2019, Frappe Technologies and contributors
// For license information, please see license.txt

frappe.ui.form.on('Data Import Beta', {
	setup(frm) {
		frappe.realtime.on('data_import_refresh', ({ data_import }) => {
			frm.import_in_progress = false;
			if (data_import !== frm.doc.name) return;
			frappe.model.clear_doc('Data Import Beta', frm.doc.name);
			frappe.model.with_doc('Data Import Beta', frm.doc.name).then(() => {
				frm.refresh();
			});
		});
		frappe.realtime.on('data_import_progress', data => {
			frm.import_in_progress = true;
			if (data.data_import !== frm.doc.name) {
				return;
			}
			let percent = Math.floor((data.current * 100) / data.total);
			let seconds = Math.floor(data.eta);
			let minutes = Math.floor(data.eta / 60);
			let eta_message =
				// prettier-ignore
				seconds < 60
					? __('About {0} seconds remaining', [seconds])
					: minutes === 1
						? __('About {0} minute remaining', [minutes])
						: __('About {0} minutes remaining', [minutes]);

			let message;
			if (data.success) {
				let message_args = [data.current, data.total, eta_message];
				message =
					frm.doc.import_type === 'Insert New Records'
						? __('Importing {0} of {1}, {2}', message_args)
						: __('Updating {0} of {1}, {2}', message_args);
			}
			if (data.skipping) {
				message = __('Skipping {0} of {1}, {2}', [
					data.current,
					data.total,
					eta_message
				]);
			}
			frm.dashboard.show_progress(__('Import Progress'), percent, message);
			frm.page.set_indicator(__('In Progress'), 'orange');

			// hide progress when complete
			if (data.current === data.total) {
				setTimeout(() => {
					frm.dashboard.hide();
					frm.refresh();
				}, 2000);
			}
		});

		frm.set_query('reference_doctype', () => {
			return {
				filters: {
					allow_import: 1
				}
			};
		});

		frm.get_field('import_file').df.options = {
			restrictions: {
				allowed_file_types: ['.csv', '.xls', '.xlsx']
			}
		};
	},

	refresh(frm) {
		frm.page.hide_icon_group();
		frm.trigger('update_indicators');
		frm.trigger('import_file');
		frm.trigger('show_import_log');
		frm.trigger('show_import_warnings');
		frm.trigger('toggle_submit_after_import');
		frm.trigger('show_import_status');
		frm.trigger('show_report_error_button');

		if (frm.doc.status === 'Partial Success') {
			frm.add_custom_button(__('Export Errored Rows'), () =>
				frm.trigger('export_errored_rows')
			);
		}

		if (frm.doc.status.includes('Success')) {
			frm.add_custom_button(
				__('Go to {0} List', [frm.doc.reference_doctype]),
				() => frappe.set_route('List', frm.doc.reference_doctype)
			);
		}

		frm.disable_save();
		if (frm.doc.status !== 'Success') {
			if (!frm.is_new() && frm.doc.import_file) {
				let label =
					frm.doc.status === 'Pending' ? __('Start Import') : __('Retry');
				frm.page.set_primary_action(label, () => frm.events.start_import(frm));
			} else {
				frm.page.set_primary_action(__('Save'), () => frm.save());
			}
		}
	},

	update_indicators(frm) {
		const indicator = frappe.get_indicator(frm.doc);
		if (indicator) {
			frm.page.set_indicator(indicator[0], indicator[1]);
		} else {
			frm.page.clear_indicator();
		}
	},

	show_import_status(frm) {
		let import_log = JSON.parse(frm.doc.import_log || '[]');
		let successful_records = import_log.filter(log => log.success);
		let failed_records = import_log.filter(log => !log.success);
		if (successful_records.length === 0) return;

		let message;
		if (failed_records.length === 0) {
			let message_args = [successful_records.length];
			if (frm.doc.import_type === 'Insert New Records') {
				message =
					successful_records.length > 1
						? __('Successfully imported {0} records.', message_args)
						: __('Successfully imported {0} record.', message_args);
			} else {
				message =
					successful_records.length > 1
						? __('Successfully updated {0} records.', message_args)
						: __('Successfully updated {0} record.', message_args);
			}
		} else {
			let message_args = [successful_records.length, import_log.length];
			if (frm.doc.import_type === 'Insert New Records') {
				message =
					successful_records.length > 1
						? __('Successfully imported {0} records out of {1}.', message_args)
						: __('Successfully imported {0} record out of {1}.', message_args);
			} else {
				message =
					successful_records.length > 1
						? __('Successfully updated {0} records out of {1}.', message_args)
						: __('Successfully updated {0} record out of {1}.', message_args);
			}
		}
		frm.dashboard.set_headline(message);
	},

	show_report_error_button(frm) {
		if (frm.doc.status === 'Error') {
			frappe.db
				.get_list('Error Log', {
					filters: { method: frm.doc.name },
					fields: ['method', 'error'],
					order_by: 'creation desc',
					limit: 1
				})
				.then(result => {
					if (result.length > 0) {
						frm.add_custom_button('Report Error', () => {
							let fake_xhr = {
								responseText: JSON.stringify({
									exc: result[0].error
								})
							};
							frappe.request.report_error(fake_xhr, {});
						});
					}
				});
		}
	},

	start_import(frm) {
		frm
			.call({
				doc: frm.doc,
				method: 'start_import',
				btn: frm.page.btn_primary
			})
			.then(r => {
				if (r.message === true) {
					frm.disable_save();
				}
			});
	},

	download_template(frm) {
		if (
			frm.data_exporter &&
			frm.data_exporter.doctype === frm.doc.reference_doctype
		) {
			frm.data_exporter.dialog.show();
			set_export_records();
		} else {
			frappe.require('/assets/js/data_import_tools.min.js', () => {
				frm.data_exporter = new frappe.data_import.DataExporter(
					frm.doc.reference_doctype
				);
				set_export_records();
			});
		}

		function set_export_records() {
			if (frm.doc.import_type === 'Insert New Records') {
				frm.data_exporter.dialog.set_value('export_records', 'blank_template');
			} else {
				frm.data_exporter.dialog.set_value('export_records', 'all');
			}
			// Force ID field to be exported when updating existing records
			let id_field = frm.data_exporter.dialog.get_field(
				frm.doc.reference_doctype
			).options[0];
			if (id_field.value === 'name' && id_field.$checkbox) {
				id_field.$checkbox
					.find('input')
					.prop('disabled', frm.doc.import_type === 'Update Existing Records');
			}
		}
	},

	reference_doctype(frm) {
		frm.trigger('toggle_submit_after_import');
	},

	toggle_submit_after_import(frm) {
		frm.toggle_display('submit_after_import', false);
		let doctype = frm.doc.reference_doctype;
		if (doctype) {
			frappe.model.with_doctype(doctype, () => {
				let meta = frappe.get_meta(doctype);
				frm.toggle_display('submit_after_import', meta.is_submittable);
			});
		}
	},

	import_file(frm) {
		frm.toggle_display('section_import_preview', frm.doc.import_file);
		if (!frm.doc.import_file) {
			frm.get_field('import_preview').$wrapper.empty();
			return;
		}

		// load import preview
		frm.get_field('import_preview').$wrapper.empty();
		$('<span class="text-muted">')
			.html(__('Loading import file...'))
			.appendTo(frm.get_field('import_preview').$wrapper);

		frm
			.call({
				doc: frm.doc,
				method: 'get_preview_from_template',
				error_handlers: {
					TimestampMismatchError() {
						// ignore this error
					}
				}
			})
			.then(r => {
				let preview_data = r.message;
				frm.events.show_import_preview(frm, preview_data);
				frm.events.show_import_warnings(frm, preview_data);
			});
	},

	show_import_preview(frm, preview_data) {
		let import_log = JSON.parse(frm.doc.import_log || '[]');

		if (
			frm.import_preview &&
			frm.import_preview.doctype === frm.doc.reference_doctype
		) {
			frm.import_preview.preview_data = preview_data;
			frm.import_preview.import_log = import_log;
			frm.import_preview.refresh();
			return;
		}

		frappe.require('/assets/js/data_import_tools.min.js', () => {
			frm.import_preview = new frappe.data_import.ImportPreview({
				wrapper: frm.get_field('import_preview').$wrapper,
				doctype: frm.doc.reference_doctype,
				preview_data,
				import_log,
				frm,
				events: {
					remap_column(changed_map) {
						let template_options = JSON.parse(frm.doc.template_options || '{}');
						template_options.remap_column = template_options.remap_column || {};
						Object.assign(template_options.remap_column, changed_map);
						frm.set_value('template_options', JSON.stringify(template_options));
						frm.save().then(() => frm.trigger('import_file'));
					}
				}
			});
		});
	},

	export_errored_rows(frm) {
		open_url_post(
			'/api/method/frappe.core.doctype.data_import_beta.data_import_beta.download_errored_template',
			{
				data_import_name: frm.doc.name
			}
		);
	},

	show_import_warnings(frm, preview_data) {
		let warnings = JSON.parse(frm.doc.template_warnings || '[]');
		warnings = warnings.concat(preview_data.warnings || []);

		frm.toggle_display('import_warnings_section', warnings.length > 0);
		if (warnings.length === 0) {
			frm.get_field('import_warnings').$wrapper.html('');
			return;
		}

		// group warnings by row
		let warnings_by_row = {};
		let other_warnings = [];
		for (let warning of warnings) {
			if (warning.row) {
				warnings_by_row[warning.row] = warnings_by_row[warning.row] || [];
				warnings_by_row[warning.row].push(warning);
			} else {
				other_warnings.push(warning);
			}
		}

		let html = '';
		html += Object.keys(warnings_by_row)
			.map(row_number => {
				let message = warnings_by_row[row_number]
					.map(w => {
						if (w.field) {
							return `<li>${w.field.label}: ${w.message}</li>`;
						}
						return `<li>${w.message}</li>`;
					})
					.join('');
				return `
				<div class="alert border" data-row="${row_number}">
					<div class="uppercase">${__('Row {0}', [row_number])}</div>
					<div class="body"><ul>${message}</ul></div>
				</div>
			`;
			})
			.join('');

		html += other_warnings
			.map(warning => {
				let header = '';
				if (warning.col) {
					header = __('Column {0}', [warning.col]);
				}
				return `
					<div class="alert border" data-col="${warning.col}">
						<div class="uppercase">${header}</div>
						<div class="body">${warning.message}</div>
					</div>
				`;
			})
			.join('');
		frm.get_field('import_warnings').$wrapper.html(`
			<div class="row">
				<div class="col-sm-6 warnings text-muted">${html}</div>
			</div>
		`);
	},

	show_failed_logs(frm) {
		frm.trigger('show_import_log');
	},

	show_import_log(frm) {
		let import_log = JSON.parse(frm.doc.import_log || '[]');
		let logs = import_log;
		frm.toggle_display('import_log', false);
		frm.toggle_display('import_log_section', logs.length > 0);

		if (logs.length === 0) {
			frm.get_field('import_log_preview').$wrapper.empty();
			return;
		}

		let rows = logs
			.map(log => {
				let html = '';
				if (log.success) {
					if (frm.doc.import_type === 'Insert New Records') {
						html = __('Successfully imported {0}', [
							`<span class="underline">${frappe.utils.get_form_link(
								frm.doc.reference_doctype,
								log.docname,
								true
							)}<span>`
						]);
					} else {
						html = __('Successfully updated {0}', [
							`<span class="underline">${frappe.utils.get_form_link(
								frm.doc.reference_doctype,
								log.docname,
								true
							)}<span>`
						]);
					}
				} else {
					let messages = log.messages
						.map(JSON.parse)
						.map(m => {
							let title = m.title ? `<strong>${m.title}</strong>` : '';
							let message = m.message ? `<div>${m.message}</div>` : '';
							return title + message;
						})
						.join('');
					let id = frappe.dom.get_unique_id();
					html = `${messages}
						<button class="btn btn-default btn-xs margin-top" type="button" data-toggle="collapse" data-target="#${id}" aria-expanded="false" aria-controls="${id}">
							${__('Show Traceback')}
						</button>
						<div class="collapse margin-top" id="${id}">
							<div class="well">
								<pre>${log.exception}</pre>
							</div>
						</div>`;
				}
				let indicator_color = log.success ? 'green' : 'red';
				let title = log.success ? __('Success') : __('Failure');

				if (frm.doc.show_failed_logs && log.success) {
					return '';
				}

				return `<tr>
					<td>${log.row_indexes.join(', ')}</td>
					<td>
						<div class="indicator ${indicator_color}">${title}</div>
					</td>
					<td>
						${html}
					</td>
				</tr>`;
			})
			.join('');

		if (!rows && frm.doc.show_failed_logs) {
			rows = `<tr><td class="text-center text-muted" colspan=3>
				${__('No failed logs')}
			</td></tr>`;
		}

		frm.get_field('import_log_preview').$wrapper.html(`
			<table class="table table-bordered">
				<tr class="text-muted">
					<th width="10%">${__('Row Number')}</th>
					<th width="10%">${__('Status')}</th>
					<th width="80%">${__('Message')}</th>
				</tr>
				${rows}
			</table>
		`);
	},

	show_missing_link_values(frm, missing_link_values) {
		let can_be_created_automatically = missing_link_values.every(
			d => d.has_one_mandatory_field
		);

		let html = missing_link_values
			.map(d => {
				let doctype = d.doctype;
				let values = d.missing_values;
				return `
					<h5>${doctype}</h5>
					<ul>${values.map(v => `<li>${v}</li>`).join('')}</ul>
				`;
			})
			.join('');

		if (can_be_created_automatically) {
			// prettier-ignore
			let message = __('There are some linked records which needs to be created before we can import your file. Do you want to create the following missing records automatically?');
			frappe.confirm(message + html, () => {
				frm
					.call('create_missing_link_values', {
						missing_link_values
					})
					.then(r => {
						let records = r.message;
						frappe.msgprint(
							__('Created {0} records successfully.', [records.length])
						);
					});
			});
		} else {
			frappe.msgprint(
				// prettier-ignore
				__('The following records needs to be created before we can import your file.') + html
			);
		}
	}
});
