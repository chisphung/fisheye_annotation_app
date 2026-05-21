cd /home/locth/omni2rect_DEIM/vehicle_visualizer/
source .venv/bin/activate
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload