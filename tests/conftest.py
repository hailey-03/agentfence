import os

os.environ["LLM_MODE"] = "fake"
os.environ["DATABASE_URL"] = "sqlite:///./test_agentfence.db"   # 테스트는 MariaDB 없이 SQLite로
os.environ["JWT_SECRET_KEY"] = "test-secret"
if os.path.exists("test_agentfence.db"):
    os.remove("test_agentfence.db")
