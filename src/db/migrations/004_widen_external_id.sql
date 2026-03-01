-- external_id 改为 TEXT，Yahoo Finance RSS URL 可超 200 字符
ALTER TABLE news_items ALTER COLUMN external_id TYPE TEXT;
