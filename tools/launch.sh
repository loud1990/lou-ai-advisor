#!/usr/bin/env bash
# Launch / relaunch Civ 7 for the harness, forcing the NATIVE Vulkan renderer.
#
# Why this is not a plain `proton run`: Ubuntu 24.04 sets
# kernel.apparmor_restrict_unprivileged_userns=1, so bubblewrap (the Steam
# Linux Runtime sandbox) can only set up its user namespace when launched by
# the AppArmor-allowlisted Steam client itself. Invoking the runtime directly
# fails with "bwrap: setting up uid map: Permission denied". So we must launch
# through Steam.
#
# But Steam's default launch runs Civ7_Win64_DX12_FinalRelease.exe, which under
# Proton goes through the DX12->Vulkan (VKD3D) translation layer — the path
# that hangs/crashes within a few turns. The game also ships a native Vulkan
# renderer. To make Steam's normal (container-correct) launch use it, we point
# the DX12 launch path at the Vulkan binary via a reversible symlink swap, then
# launch through Steam. `restore` undoes the swap.
#
# Subcommands:
#   vulkan   swap in the Vulkan binary and launch via Steam (default)
#   restore  undo the swap (DX12 binary back in place)
#   kill     kill the game + any lingering Firaxis crash reporter
#   running  exit 0 if the game process is alive
set -u

ROOT="$HOME/.steam/debian-installation"
WIN64="$ROOT/steamapps/common/Sid Meier's Civilization VII/Base/Binaries/Win64"
DX12="$WIN64/Civ7_Win64_DX12_FinalRelease.exe"
VULKAN="$WIN64/Civ7_Win64_Vulkan_FinalRelease.exe"
BAK="$WIN64/Civ7_Win64_DX12_FinalRelease.exe.dx12bak"
LOG="/tmp/civ7_launch.log"

cmd_kill() {
	pkill -f "Civ7_Win64_(DX12|Vulkan)_FinalRelease" 2>/dev/null
	# A lingering crash-reporter window keeps Steam thinking the game still runs.
	pkill -f "FiraxisCrashReporter" 2>/dev/null
	sleep 2
	return 0
}

cmd_running() {
	pgrep -f "Civ7_Win64_(DX12|Vulkan)_FinalRelease" >/dev/null
}

swap_to_vulkan() {
	# Already swapped? (DX12 path is a symlink to the Vulkan binary.)
	if [ -L "$DX12" ]; then return 0; fi
	if [ ! -f "$BAK" ]; then
		mv "$DX12" "$BAK" || { echo "[launch] backup failed"; exit 1; }
	fi
	ln -sf "$VULKAN" "$DX12"
	echo "[launch] DX12 launch path now points at the Vulkan binary"
}

cmd_restore() {
	if [ -L "$DX12" ] && [ -f "$BAK" ]; then
		rm -f "$DX12"
		mv "$BAK" "$DX12"
		echo "[launch] restored original DX12 binary"
	else
		echo "[launch] nothing to restore"
	fi
}

cmd_vulkan() {
	swap_to_vulkan
	cmd_kill
	echo "[launch] launching via Steam (now native Vulkan)" | tee "$LOG"
	setsid steam steam://rungameid/1295660 >>"$LOG" 2>&1 &
	echo "[launch] steam pid $!  log: $LOG"
}

case "${1:-vulkan}" in
	vulkan)  cmd_vulkan ;;
	restore) cmd_restore ;;
	kill)    cmd_kill ;;
	running) cmd_running ;;
	*) echo "usage: $0 {vulkan|restore|kill|running}"; exit 2 ;;
esac
