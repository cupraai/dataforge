PYTHON=""
if [ -f "backend/.venv/Scripts/python.exe" ]; then
  PYTHON="backend/.venv/Scripts/python.exe"
elif [ -f "backend/.venv/bin/python" ]; then
  PYTHON="backend/.venv/bin/python"
fi

# POSIX sh, so the shape of scripts/console.sh without its colors.
if [ -z "$PYTHON" ]; then
  echo "  x git hook: backend/.venv was not found." >&2
  echo "      Run setup.bat or ./setup.sh first, then commit again." >&2
  exit 1
fi
