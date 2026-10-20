import os

os.environ["LLM_MODE"] = "fake"
os.environ["DATABASE_URL"] = "sqlite:///./test_agentfence.db"
if os.path.exists("test_agentfence.db"):
    os.remove("test_agentfence.db")
