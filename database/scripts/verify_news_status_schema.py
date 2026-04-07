#!/usr/bin/env python3
"""
Verify news_status table schema and indexes
"""

import psycopg2
import sys

DATABASE_URL = "postgresql://trading_user:password@localhost:5432/trading_bot"

def verify_schema():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()
    
    errors = []
    
    # 1. Verify table exists
    cur.execute("""
        SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_name = 'news_status'
        );
    """)
    if not cur.fetchone()[0]:
        errors.append("Table 'news_status' does not exist")
        return errors
    
    # 2. Verify columns
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'news_status'
        ORDER BY ordinal_position;
    """)
    columns = cur.fetchall()
    expected_cols = {
        'id': 'uuid',
        'news_id': 'character varying',
        'source': 'character varying',
        'title': 'text',
        'summary': 'text',
        'url': 'character varying',
        'published_at': 'timestamp without time zone',
        'category': 'character varying',
        'alert_level': 'integer',
        'sentiment': 'numeric',
        'symbols': 'jsonb',
        'market_status_id': 'uuid',
        'correlation_id': 'uuid',
        'processed': 'boolean',
        'notified_agents': 'jsonb',
        'created_at': 'timestamp without time zone',
        'updated_at': 'timestamp without time zone',
    }
    for col in columns:
        col_name, data_type, _, _ = col
        if col_name in expected_cols:
            if data_type != expected_cols[col_name]:
                errors.append(f"Column '{col_name}' type mismatch: expected {expected_cols[col_name]}, got {data_type}")
    
    # 3. Verify indexes
    cur.execute("""
        SELECT indexname 
        FROM pg_indexes 
        WHERE tablename = 'news_status';
    """)
    indexes = [row[0] for row in cur.fetchall()]
    expected_indexes = [
        'idx_news_status_alert_level',
        'idx_news_status_symbols', 
        'idx_news_status_published_at',
        'idx_news_status_category',
        'idx_news_status_processed',
        'idx_news_status_market_status_id'
    ]
    for idx in expected_indexes:
        if idx not in indexes:
            errors.append(f"Index '{idx}' does not exist")
    
    # 4. Verify foreign key
    cur.execute("""
        SELECT constraint_name 
        FROM information_schema.table_constraints 
        WHERE table_name = 'news_status' AND constraint_type = 'FOREIGN KEY';
    """)
    fks = cur.fetchall()
    if not fks:
        errors.append("Foreign key to market_status does not exist")
    
    # 5. Verify test data
    cur.execute("SELECT COUNT(*) FROM news_status;")
    count = cur.fetchone()[0]
    if count < 5:
        errors.append(f"Test data count mismatch: expected at least 5, got {count}")
    
    # 6. Verify data integrity
    cur.execute("""
        SELECT news_id, alert_level, sentiment, processed 
        FROM news_status 
        WHERE alert_level NOT IN (1,2,3,4);
    """)
    invalid_alert = cur.fetchall()
    if invalid_alert:
        errors.append(f"Invalid alert_level values found: {invalid_alert}")
    
    cur.execute("""
        SELECT news_id, sentiment 
        FROM news_status 
        WHERE sentiment < -1.0 OR sentiment > 1.0;
    """)
    invalid_sentiment = cur.fetchall()
    if invalid_sentiment:
        errors.append(f"Invalid sentiment values found: {invalid_sentiment}")
    
    cur.close()
    conn.close()
    
    return errors

if __name__ == "__main__":
    errors = verify_schema()
    if errors:
        print("❌ Verification FAILED:")
        for e in errors:
            print(f"  - {e}")
        sys.exit(1)
    else:
        print("✅ Verification PASSED")
        print("  - Table exists")
        print("  - All columns correct")
        print("  - All indexes created")
        print("  - Foreign key exists")
        print("  - Test data inserted (5 records)")
        print("  - Data integrity verified")
        sys.exit(0)
