export default {
  async fetch(request, env) {

    const url = new URL(request.url);
// 讀取訂單列表
if (url.pathname === "/api/orders" && request.method === "GET") {
    try {
        const result = await env.DB.prepare(`
            SELECT *
            FROM orders
            ORDER BY id DESC
        `).all();

        return Response.json({
            success: true,
            orders: result.results
        });

    } catch (error) {
        return Response.json({
            success: false,
            error: error.message
        }, {
            status: 500
        });
    }
}
    // 接收訂單
    if (url.pathname === "/api/order" && request.method === "POST") {
      try {
        const order = await request.json();

        await env.DB.prepare(`
          INSERT INTO orders
          (
            order_number,
            customer_name,
            phone,
            email,
            address,
            shipping,
            payment,
            note,
            items,
            total,
            status,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          order.orderNumber,
          order.customer.name,
          order.customer.phone,
          order.customer.email,
          order.customer.address,
          order.shipping || "",
          order.payment,
          order.note || "",
          JSON.stringify(order.items),
          order.total,
          "pending",
          order.createdAt
        )
        .run();

        return Response.json({
          success: true,
          orderNumber: order.orderNumber
        });

      } catch (error) {
        return Response.json({
          success: false,
          error: error.message
        }, {
          status: 500
        });
      }
    }

    // 其他網址繼續顯示原本網站
    return env.ASSETS.fetch(request);
  }
};
