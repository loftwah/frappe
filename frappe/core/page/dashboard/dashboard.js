// Copyright (c) 2019, Frappe Technologies Pvt. Ltd. and Contributors
// MIT License. See license.txt

frappe.provide('frappe.dashboards');
frappe.provide('frappe.dashboards.chart_sources');


frappe.pages['dashboard'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: __("Dashboard"),
		single_column: true
	});

	frappe.dashboard = new Dashboard(wrapper);
	$(wrapper).bind('show', function() {
		frappe.dashboard.show();
	});
};

class Dashboard {
	constructor(wrapper) {
		this.wrapper = $(wrapper);
		$(`<div class="dashboard">
			<div class="dashboard-graph"></div>
		</div>`).appendTo(this.wrapper.find(".page-content").empty());
		this.container = this.wrapper.find(".dashboard-graph");
		this.page = wrapper.page;
	}

	show() {
		this.route = frappe.get_route();
		if (this.route.length > 1) {
			// from route
			this.show_dashboard(this.route.slice(-1)[0]);
		} else {
			// last opened
			if (frappe.last_dashboard) {
				frappe.set_route('dashboard', frappe.last_dashboard);
			} else {
				// default dashboard
				frappe.db.get_list('Dashboard', {filters: {is_default: 1}}).then(data => {
					if (data && data.length) {
						frappe.set_route('dashboard', data[0].name);
					} else {
						// no default, get the latest one
						frappe.db.get_list('Dashboard', {limit: 1}).then(data => {
							if (data && data.length) {
								frappe.set_route('dashboard', data[0].name);
							} else {
								// create a new dashboard!
								frappe.new_doc('Dashboard');
							}
						});
					}
				});
			}
		}
	}

	show_dashboard(current_dashboard_name) {
		if (this.dashboard_name !== current_dashboard_name) {
			this.dashboard_name = current_dashboard_name;
			let title = this.dashboard_name;
			if (!this.dashboard_name.toLowerCase().includes(__('dashboard'))) {
				// ensure dashboard title has "dashboard"
				title = __('{0} Dashboard', [title]);
			}
			this.page.set_title(title);
			this.set_dropdown();
			this.container.empty();
			this.refresh();
		}
		this.charts = {};
		frappe.last_dashboard = current_dashboard_name;
	}

	refresh() {
		this.get_permitted_dashboard_charts().then(charts => {
			if (!charts.length) {
				frappe.msgprint(__('No Permitted Charts on this Dashboard'), __('No Permitted Charts'))
			}
			this.charts = charts
							.map(chart => {
								return {
									chart_name: chart.chart,
									label: chart.chart,
									...chart
								}
							});

			this.chart_group = new frappe.widget.WidgetGroup({
				title: null,
				container: this.container,
				type: "chart",
				columns: 2,
				allow_sorting: false,
				widgets: this.charts,
			});
		});
	}

	get_permitted_dashboard_charts() {
		return frappe.xcall(
			'frappe.desk.doctype.dashboard.dashboard.get_permitted_charts',
			{
				dashboard_name: this.dashboard_name
			}).then(charts => {
				return charts;
			});
	}

	set_dropdown() {
		this.page.clear_menu();

		this.page.add_menu_item('Edit...', () => {
			frappe.set_route('Form', 'Dashboard', frappe.dashboard.dashboard_name);
		}, 1);

		this.page.add_menu_item('New...', () => {
			frappe.new_doc('Dashboard');
		}, 1);

		frappe.db.get_list("Dashboard").then(dashboards => {
			dashboards.map(dashboard => {
				let name = dashboard.name;
				if(name != this.dashboard_name){
					this.page.add_menu_item(name, () => frappe.set_route("dashboard", name));
				}
			});
		});
	}
}