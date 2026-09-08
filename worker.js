export default {
  async fetch(request, env) {

    const url = new URL(request.url);
    if (env.APP_ENV === "staging" && url.pathname === "/robots.txt") {
      return new Response("User-agent: *\nDisallow: /\n", {headers: {"Content-Type": "text/plain; charset=utf-8"}});
    }
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

// 更新訂單狀態
if (url.pathname === "/api/order/status" && request.method === "POST") {
  try {
    const data = await request.json();

    const allowedStatuses = [
      "pending",
      "confirmed",
      "paid",
      "shipped",
      "completed",
      "cancelled"
    ];

    if (!data.orderNumber || !allowedStatuses.includes(data.status)) {
      return Response.json({
        success: false,
        error: "訂單編號或狀態不正確"
      }, { status: 400 });
    }

    const result = await env.DB.prepare(`
      UPDATE orders
      SET status = ?
      WHERE order_number = ?
    `)
      .bind(data.status, data.orderNumber)
      .run();

    if (result.meta.changes === 0) {
      return Response.json({
        success: false,
        error: "找不到此訂單"
      }, { status: 404 });
    }

    return Response.json({
      success: true
    });

  } catch (error) {
    return Response.json({
      success: false,
      error: error.message
    }, { status: 500 });
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
        const response = await env.ASSETS.fetch(request);
    if (env.APP_ENV !== "staging") return response;
    const stagingResponse = new Response(response.body, response);
    stagingResponse.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
    if (!response.headers.get("Content-Type")?.includes("text/html")) return stagingResponse;
    return new HTMLRewriter().on("body", {
      element(element) {
        element.prepend('<aside role="note" style="position:relative;z-index:9999;background:#fff1c2;color:#342300;padding:12px 16px;text-align:center;font:600 16px/1.5 sans-serif">測試版｜僅供功能確認，請勿填寫真實個資或付款。測試訂單與正式版分開。</aside>', {html: true});
      }
    }).transform(stagingResponse);
  }
};
