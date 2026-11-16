import React from "react";

export default function AdminManagement({
  section,
  data,
  disabled,
  mutate,
  openCreate,
}) {
  if (section === "Managers")
    return (
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Manager accounts</h2>
            <p>
              Give your team access to products, stock, and order fulfilment.
            </p>
          </div>
          <button disabled={disabled} onClick={openCreate}>
            + Create manager
          </button>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-live-table">
            <thead>
              <tr>
                <th>Manager</th>
                <th>Access</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {data.managers.map((m) => (
                <tr key={m.user_id}>
                  <td>
                    <strong>{m.full_name}</strong>
                    <small>{m.email}</small>
                  </td>
                  <td>
                    <span
                      className={`member-status ${m.is_active ? "member-active" : ""}`}
                    >
                      {m.is_active ? "Active" : "Disabled"}
                    </span>
                  </td>
                  <td>{new Date(m.created_at).toLocaleDateString("en-MY")}</td>
                  <td>
                    <button
                      disabled={disabled}
                      onClick={() =>
                        mutate(
                          `managers/${m.user_id}`,
                          "PATCH",
                          { is_active: !m.is_active },
                          m.is_active
                            ? "Manager disabled."
                            : "Manager reactivated.",
                        )
                      }
                    >
                      {m.is_active ? "Disable access" : "Reactivate"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.managers.length && (
            <p className="table-empty">
              No managers yet. Create an account to get your team started.
            </p>
          )}
        </div>
      </section>
    );
  if (section === "Activity")
    return (
      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Staff activity</h2>
            <p>
              The latest 100 stock movements and order status changes, including
              customer orders.
            </p>
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-live-table">
            <thead>
              <tr>
                <th>Who</th>
                <th>Action</th>
                <th>Details</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {data.activity.map((a) => (
                <tr key={a.activity_id}>
                  <td>
                    <strong>{a.staff_name || "System"}</strong>
                    <small>{a.staff_email}</small>
                  </td>
                  <td>{a.action}</td>
                  <td>{a.detail}</td>
                  <td>
                    {new Date(a.created_at).toLocaleString("en-MY", {
                      timeZone: "Asia/Kuala_Lumpur",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.activity.length && (
            <p className="table-empty">No activity recorded yet.</p>
          )}
        </div>
      </section>
    );
  if (section === "Settings")
    return (
      <section className="panel settings-panel">
        <h2>Shop details</h2>
        <p>Keep the store name and contact email up to date.</p>
        <form
          key={JSON.stringify(data.settings)}
          onSubmit={(e) => {
            e.preventDefault();
            mutate(
              "settings",
              "PATCH",
              Object.fromEntries(new FormData(e.currentTarget)),
              "Shop settings saved.",
            );
          }}
        >
          <fieldset disabled={disabled}>
            <label>
              Store name
              <input
                name="store_name"
                defaultValue={data.settings?.store_name}
                required
                minLength="2"
                maxLength="160"
              />
            </label>
            <label>
              Contact email
              <input
                name="contact_email"
                type="email"
                defaultValue={data.settings?.contact_email}
                required
                maxLength="254"
              />
            </label>
            <button className="solid-action">Save shop settings</button>
          </fieldset>
        </form>
      </section>
    );
  return (
    <>
      <div className="dashboard-cards">
        <Card
          title="Managers"
          value={data.managers.length}
          note={`${data.managers.filter((m) => m.is_active).length} with active access`}
        />
        <Card
          title="Disabled accounts"
          value={data.managers.filter((m) => !m.is_active).length}
          note="Reactivate access from Managers"
        />
        <Card
          title="Recorded activity"
          value={data.activity.length}
          note="Latest stock and order changes"
        />
        <Card
          title="Store"
          value={data.settings?.store_name || "—"}
          note={data.settings?.contact_email}
        />
      </div>
      <div className="workspace-tasks">
        {[
          [
            "Managers",
            "Manage your team",
            "Create manager accounts and control access.",
          ],
          [
            "Activity",
            "Review store activity",
            "See who adjusted stock or updated an order.",
          ],
          [
            "Settings",
            "Keep shop details current",
            "Manage your store name and contact email.",
          ],
        ].map(([target, title, description]) => (
          <button key={target} onClick={() => openCreate(target)}>
            <span>{target}</span>
            <strong>{title} ↗</strong>
            <p>{description}</p>
          </button>
        ))}
      </div>
    </>
  );
}
function Card({ title, value, note }) {
  return (
    <section className="metric-card">
      <div className="metric-top">{title}</div>
      <strong className="metric-value">{value}</strong>
      <div className="metric-note">{note}</div>
    </section>
  );
}
