"""開發期的極簡遷移：只補「新增的欄位」。

`metadata.create_all()` 只會建立不存在的表，**不會修改既有的表**，
所以在 tables.py 加欄位後，既有的 SQLite 檔不會跟著長出新欄位。
這支在啟動時比對 metadata 與實際結構，把缺的欄位 ALTER TABLE 加上去。

限制（刻意保守，避免搞爛資料）：
- 只加欄位，不改型別、不刪欄位、不改約束。
- 只處理「可為 NULL 且沒有 server_default」的欄位；其餘印訊息請開發者手動處理。
正式環境的結構變更請改用 Alembic（見 reference/backend/database.md §7）。
"""

from sqlalchemy import inspect, text

from db.engine import engine
from db.tables import metadata


def add_missing_columns() -> None:
    inspector = inspect(engine)

    for table in metadata.sorted_tables:
        if not inspector.has_table(table.name):
            continue  # 新表交給 create_all

        existing = {c["name"] for c in inspector.get_columns(table.name)}
        for column in table.columns:
            if column.name in existing:
                continue

            if not column.nullable or column.server_default is not None:
                print(
                    f"[migrate] {table.name}.{column.name} 需要預設值或 NOT NULL，"
                    "請手動處理（或改用 Alembic）"
                )
                continue

            column_type = column.type.compile(engine.dialect)
            with engine.begin() as conn:
                conn.execute(
                    text(f"ALTER TABLE {table.name} ADD COLUMN {column.name} {column_type}")
                )
            print(f"[migrate] {table.name} 已新增欄位 {column.name}")
