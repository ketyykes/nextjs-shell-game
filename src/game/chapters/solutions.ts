/**
 * 六章 36 台終端機的正解序列，以終端機 id 為 key，每一串都是「最後一步才過關」。
 *
 * 單元測試（`ch<n>-*.test.ts`、`solutions.test.ts`）與 e2e（`e2e/chapters.spec.ts`、`e2e/happy-path.spec.ts`）共用這一份，
 * 改劇本或判定時只要改這裡；`solutions.test.ts` 會用真的 Shell 逐台確認每一串都還能過關。
 *
 * 這個檔案不能有任何 import（包括 `@/` 別名）：e2e 用相對路徑 import 它，也不該把劇本或 shell 帶進 Playwright。
 * app 本身不 import 這個檔案。
 */

/** 終端機 id → 正解指令序列。 */
export const SOLUTIONS: Readonly<Record<string, readonly string[]>> = {
	// 第一章
	"ch1-t1": ["pwd", "ls", "cat wake_up.txt"],
	"ch1-t2": ["ls", "cd oxygen", "cat status.txt", "cd ..", "cd power", "cat status.txt"],
	"ch1-t3": ["ls", "cat roster.txt", "cd ~", "ls /home", "ls -l /home/abin", "cat /home/abin/day_900.txt"],
	"ch1-t4": [
		"cat work_order.txt",
		"cat /deck1/systems/power/README.txt",
		"cd /deck1/systems/power/breakers/B3",
		"ls",
		"ls -a",
		"cat .override",
	],
	"ch1-t5": ["ls", "cat index.txt", "ls records", "history", "clear", "cat records/PT-2028-0601-QN0606.txt"],
	"ch1-t6": ["cat lock.txt", "cd /home/tech/pod_06", "ls", "ls -a", "cat .key"],
	// 第二章
	"ch2-t1": ["ls", "cat README.txt", "head access.log", "tail access.log"],
	"ch2-t2": ["ls", "cat INDEX.txt", "cd evac", "wc -l evac_*.log", "head -n 5 evac_011.log"],
	"ch2-t3": ["ls", "wc -l door_events.log", "grep lock door_events.log", "grep -n LOCK door_events.log"],
	"ch2-t4": ["cat README.txt", "ls logs", "grep ANOMALY logs/2029/q1.log", "grep -r ANOMALY logs"],
	"ch2-t5": [
		"cat README.txt",
		"ls snapshots",
		'find . -name "rollback_*"',
		"tail snapshots/2028/06/02/core/nova/rollback_2028-06-02.log",
	],
	"ch2-t6": [
		"cat lock.txt",
		'find /deck2/vault -name "*exit_key*"',
		"grep -r ACTIVE /deck2/vault",
		"cat /deck2/vault/2031/03/.pending/.exit_key_2031.txt",
	],
	// 第三章
	"ch3-t1": ["ls", "ls -a", "cat work_order.txt", "mkdir repair"],
	"ch3-t2": [
		"ls",
		"cat README.txt",
		"ls backup",
		"cat backup/core.cfg",
		"cp backup/core.cfg ~/repair/",
		"touch ~/repair/NOTES.txt",
	],
	"ch3-t3": ["cat README.txt", "ls", "ls -la", "cat .bash_history", "mv .parts_list.txt inventory/parts_list.txt"],
	"ch3-t4": [
		"cat status.txt",
		"ls",
		"rm startup.lock",
		"rm -r config.corrupt",
		"mkdir config",
		"cp ~/repair/core.cfg config/",
	],
	"ch3-t5": [
		"ls",
		"cat backup_policy.txt",
		"cat rollback.log",
		"cd /deck3/reactor",
		"ls",
		"cp -r config config.bak",
	],
	"ch3-t6": [
		"cat door_lock.txt",
		"ls /deck3/reactor/config",
		"ls -a /deck3/reactor/config",
		"cat /deck3/reactor/config/.moved_by_nova",
		"mkdir -p auth/keys",
		"cp /var/nova/hold/launch_key auth/keys/",
	],
	// 第四章
	"ch4-t1": ["ls", "cat register.txt", "echo KEPLER-9", "echo KEPLER-9 > callsign.txt"],
	"ch4-t2": ["ls", "cat README.txt", "ls stations | wc -l", "grep 回應 ping.log", "grep 回應 ping.log | tail -n 1"],
	"ch4-t3": ["ls", "cat README.txt", "cat pointing.log", "sort pointing.log | tail -n 1"],
	"ch4-t4": [
		"ls fragments",
		"cat fragments/part_01.txt",
		"sort fragments/*",
		"sort fragments/* | uniq -c",
		"sort fragments/* | uniq > signal.txt",
	],
	"ch4-t5": ["ls", "cat README.txt", "cat outbox.txt", "cat signal.txt >> outbox.txt", "cat tx.log"],
	"ch4-t6": [
		"cat lock.txt",
		"ls /deck4/comms",
		"cat /deck4/comms/callsign.txt /deck4/comms/signal.txt > manifest.txt",
	],
	// 第五章
	"ch5-t1": ["ls", "cat README.txt", "man env", "env"],
	"ch5-t2": [
		"ls",
		"cat handover.txt",
		"man export",
		"export CAPTAIN_KEY=CAPT-0417",
		"env",
		"cat /deck5/keys/$CAPTAIN_KEY.txt",
	],
	"ch5-t3": [
		"ls",
		"cat log_0601.txt",
		"ls -l sealed",
		"chmod +r sealed/log_final.txt",
		"ls -l sealed",
		"cat sealed/log_final.txt",
	],
	"ch5-t4": [
		"ls",
		"cat jobs.txt",
		"ls -l scheduler",
		"chmod 644 scheduler/cron_2028-06-02.log",
		"ls -l scheduler",
		"cat scheduler/cron_2028-06-02.log",
	],
	"ch5-t5": ["cat README.txt", "env", "ls $POD_DIR", "cd $POD_DIR", "cat status.txt", "cat pod_03/launch.log"],
	"ch5-t6": [
		"cat lock.txt",
		"cat /deck5/nav/handover.txt",
		"export AUTH=CAPT-0417",
		"ls -l $AUTH_DIR",
		"chmod +r $AUTH_DIR/$AUTH.key",
		"cat $AUTH_DIR/$AUTH.key",
	],
	// 第六章
	"ch6-t1": ["ls", "cat welcome.txt", "cat access_log.txt", "ps"],
	"ch6-t2": ["ls", "cat screens.txt", "cat mem_usage.log", "ps", "top"],
	"ch6-t3": [
		"cat README.txt",
		"ps | grep nova",
		"ls rollback",
		"cat rollback/progress.txt",
		'find /deck6/memory -name "nova_*"',
		"cat core/self/nova_identity.txt",
	],
	"ch6-t4": ["cat core_status.txt", "ps", "kill -9 1207"],
	"ch6-t5": [
		"cat README.txt",
		"ls crontab",
		"grep -r pod_06 crontab",
		"cat crontab/cron_2028-06-02",
		"ps | grep scheduler",
		"kill -9 1208",
	],
	"ch6-t6": [
		"cat launch_procedure.txt",
		"ls -l sealed",
		"chmod +r sealed/launch_code.txt",
		"cat sealed/launch_code.txt",
		"echo EP-0606-ARGO > launch.txt",
		"export PASSENGERS=1",
		"env",
		"ps",
		"kill 47731",
	],
};

/** 取某台終端機的正解序列，沒有就丟錯（e2e 打錯 id 時直接失敗，不會默默打空指令）。 */
export function solutionFor(terminalId: string): readonly string[] {
	const steps = SOLUTIONS[terminalId];
	if (steps === undefined) {
		throw new Error(`沒有 ${terminalId} 的正解序列`);
	}
	return steps;
}
