#!/usr/bin/env bash
# Drive the menus from a fresh launch into the loaded save and into live play.
#
# Menu clicks go through X11/XTEST (tools/xui.py) — the raw-input uinput device
# is unreliable on the shell UI. Each click is verified against the mod's log
# emissions and retried, so cinematic/transition timing can't leave us stranded:
#   * main menu  -> no AI_ADVISOR_STATE is emitted
#   * CONTINUE   -> the leader-intro "BEGIN GAME" screen emits AI_ADVISOR_STATE
#   * BEGIN GAME -> live play emits AI_ADVISOR_GROWTH/TECH/TURN
# Coordinates are for 3840x2160.
set -u
ULOG="$HOME/.steam/debian-installation/steamapps/compatdata/1295660/pfx/drive_c/users/steamuser/AppData/Local/Firaxis Games/Sid Meier's Civilization VII/Logs/UI.log"
XUI="DISPLAY=:1 /home/lou/.venvs/hf/bin/python3 $HOME/Development/civ7-ai-advisors/tools/xui.py"
xclick() { eval "$XUI click $1 $2" >/dev/null 2>&1; }
xkey()   { eval "$XUI key $1" >/dev/null 2>&1; }
# grep -c already prints 0 (and exits 1) on no match, so capture without a
# second `|| echo 0` (that produced "0\n0" and broke integer comparisons).
states() { local n; n=$(grep -c "AI_ADVISOR_STATE:" "$ULOG" 2>/dev/null); echo "${n:-0}"; }
ingame() { local n; n=$(grep -cE "AI_ADVISOR_(GROWTH|TECH|TURN):" "$ULOG" 2>/dev/null); echo "${n:-0}"; }

echo "[resume] waiting for game window…"
for i in $(seq 1 60); do pgrep -f "Civ7_Win64_DX12" >/dev/null && break; sleep 3; done
sleep 35   # let the attract cinematic finish and the menu become interactive

echo "[resume] CONTINUE (verify+retry)…"
base=$(states)
ok=0
for a in 1 2 3 4 5; do
	xclick 1900 725
	for w in $(seq 1 10); do sleep 3; [ "$(states)" -gt "$base" ] && { ok=1; break; }; done
	[ "$ok" = 1 ] && break
	echo "[resume]   retry CONTINUE ($a)"
done
[ "$ok" = 1 ] && echo "[resume] reached BEGIN GAME screen" || echo "[resume] WARN: CONTINUE unverified"
sleep 4

echo "[resume] BEGIN GAME (verify+retry)…"
base=$(ingame)
ok=0
for a in 1 2 3 4 5; do
	xclick 1050 2030
	for w in $(seq 1 10); do sleep 3; [ "$(ingame)" -gt "$base" ] && { ok=1; break; }; done
	[ "$ok" = 1 ] && break
	echo "[resume]   retry BEGIN GAME ($a)"
done
[ "$ok" = 1 ] && echo "[resume] live in-game" || echo "[resume] WARN: BEGIN GAME unverified"

# On load the game often shows a "New Tech Unlocked" (or civic) briefing popup
# whose button must be clicked to advance. It is not always present. Click its
# OK button (centred, lower third of the modal). Do NOT press Escape here — in
# normal play Escape opens the pause menu, which would stall the autoplay.
echo "[resume] clearing load briefing popup (OK)…"
sleep 3
xclick 1920 1690
echo "[resume] state: $(grep AI_ADVISOR_STATE: "$ULOG" | tail -1 | grep -oE '"turn":[0-9]+')"
