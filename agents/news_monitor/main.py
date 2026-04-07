"""
FastAPI 主服务 - 新闻监控系统
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncpg
import os
import asyncio
import httpx
from datetime import datetime

app = FastAPI(title="MarketPlayer News Monitor")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 数据库配置
DB_CONFIG = {
    "host": os.getenv("PGHOST", "localhost"),
    "port": int(os.getenv("PGPORT", "5432")),
    "database": os.getenv("DATABASE", "trading_bot"),
    "user": os.getenv("PGUSER", "zhengzefeng"),
    "password": os.getenv("PGPASSWORD", "password"),
}
db_pool = None


@app.on_event("startup")
async def startup():
    global db_pool
    db_pool = await asyncpg.create_pool(**DB_CONFIG)


@app.on_event("shutdown")
async def shutdown():
    await db_pool.close()


@app.get("/")
async def root():
    return {"status": "ok", "service": "news-monitor"}


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/api/news")
async def get_news(limit: int = 50, offset: int = 0):
    """获取新闻列表"""
    async with db_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, content, url, source, published_at, created_at
            FROM news_items
            ORDER BY published_at DESC
            LIMIT $1 OFFSET $2
            """,
            limit,
            offset
        )
        return {"success": True, "data": [dict(row) for row in rows]}


@app.post("/api/news/fetch")
async def fetch_news(limit_per_source: int = 10):
    """抓取新闻并写入数据库"""
    stats = {
        "total_fetched": 0,
        "by_source": {},
        "errors": [],
        "saved": 0
    }
    
    async def fetch_eastmoney():
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = "https://stockapi.eastmoney.com/EM-XuhanG-Api/rest/publicpolic/99"
                resp = await client.get(url, params={"client": "pc", "page": "1", "size": str(limit_per_source)})
                if resp.status_code == 200:
                    data = resp.json()
                    items = []
                    for art in data.get("LivesList", [])[:limit_per_source]:
                        items.append({
                            "title": art.get("title", ""),
                            "content": art.get("content", ""),
                            "url": art.get("url", ""),
                            "source": "eastmoney",
                            "published_at": datetime.now(),
                            "market": "cn",
                        })
                    return {"source": "eastmoney", "items": items}
                return {"source": "eastmoney", "items": []}
        except Exception as e:
            return {"source": "eastmoney", "items": [], "error": str(e)}

    async def fetch_gdelt():
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = "https://api.gdelt.net/v4"
                resp = await client.get(url, params={"mode": "artlist", "maxrec": str(limit_per_source)})
                if resp.status_code == 200:
                    data = resp.json()
                    items = []
                    for art in data.get("articles", [])[:limit_per_source]:
                        items.append({
                            "title": art.get("title", ""),
                            "content": art.get("seentitle", ""),
                            "url": art.get("url", ""),
                            "source": "gdelt",
                            "published_at": datetime.now(),
                            "market": "global",
                        })
                    return {"source": "gdelt", "items": items}
                return {"source": "gdelt", "items": []}
        except Exception as e:
            return {"source": "gdelt", "items": [], "error": str(e)}

    async def fetch_xueqiu():
        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                url = "https://stock.xueqiu.com/v5/stock/board/listingidea/robot.json"
                resp = await client.get(url, params={"page": "1", "size": str(limit_per_source)}, headers={"User-Agent": "Mozilla/5.0"})
                if resp.status_code == 200:
                    data = resp.json()
                    items = []
                    for art in data.get("items", [])[:limit_per_source]:
                        items.append({
                            "title": art.get("title", ""),
                            "content": art.get("text", ""),
                            "url": f"https://xueqiu.com/a/{art.get('id')}",
                            "source": "xueqiu",
                            "published_at": datetime.now(),
                            "market": "cn",
                        })
                    return {"source": "xueqiu", "items": items}
                return {"source": "xueqiu", "items": []}
        except Exception as e:
            return {"source": "xueqiu", "items": [], "error": str(e)}

    # 执行抓取
    results = await asyncio.gather(
        fetch_eastmoney(),
        fetch_gdelt(),
        fetch_xueqiu(),
        return_exceptions=True
    )
    
    # 处理结果
    all_news = []
    for result in results:
        if isinstance(result, Exception):
            stats["errors"].append(str(result))
            continue
        
        source = result.get("source")
        items = result.get("items", [])
        error = result.get("error")
        
        if error:
            stats["errors"].append(f"{source}: {error}")
        else:
            stats["by_source"][source] = len(items)
            stats["total_fetched"] += len(items)
            all_news.extend(items)
    
    # 写入数据库
    if all_news:
        inserted = await _save_news(all_news)
        stats["saved"] = inserted
    
    return {"success": True, "stats": stats}


async def _save_news(news_items):
    """写入新闻到数据库"""
    inserted = 0
    
    async with db_pool.acquire() as conn:
        for news in news_items:
            try:
                title_hash = hash(news['title'] + news['source'])
                news_id = f"news_{abs(title_hash)}"[:20]
                
                exists = await conn.fetchval(
                    "SELECT 1 FROM news_items WHERE title = $1 AND source = $2",
                    news["title"], news["source"]
                )
                if exists:
                    continue
                
                await conn.execute(
                    """
                    INSERT INTO news_items 
                    (id, title, content, url, source, published_at, market, created_at)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
                    """,
                    news_id,
                    news["title"],
                    news.get("content", ""),
                    news.get("url", ""),
                    news["source"],
                    news.get("published_at"),
                    news.get("market", "global"),
                )
                inserted += 1
            except Exception:
                pass
    
    return inserted


@app.get("/api/news/stats")
async def get_stats():
    """统计"""
    async with db_pool.acquire() as conn:
        total = await conn.fetchval('SELECT COUNT(*) FROM news_items')
        return {"success": True, "data": {"total": total}}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)