//! Batch-Rechner für die Solver-Bibliothek des Trainers.
//!
//! Liest spots.txt (eine Zeile je Spot × Board, Tab-getrennt, erzeugt von
//! make-spots.js aus den Ranges des Trainers), löst jeden Flop mit
//! postflop-solver und schreibt die Flop-Strategien als JSON nach <outdir>.
//!
//! Gespeichert wird nur die FLOP-Straße, bis drei Aktionen tief:
//!   ""      OOP handelt zuerst (Check / Bets)
//!   "0"     IP nach OOP-Check
//!   "0-1"   OOP gegen die erste IP-Bet, usw.
//!   "1"     IP gegen die erste OOP-Bet
//! Je Knoten: Aktionen und je Hand die Häufigkeit in Promille.
//!
//! Bereits vorhandene Ausgabedateien werden übersprungen — ein
//! abgebrochener Nachtlauf macht beim nächsten Start einfach weiter.
//!
//! Aufruf: pt-solver-batch <spots.txt> <outdir> [--exploit 0.5] [--maxiter 1000] [--only <id>]

use postflop_solver::*;
use std::fmt::Write as _;
use std::time::Instant;

struct Spot {
    id: String,
    board: String,
    pot: i32,
    eff: i32,
    oop: String,
    ip: String,
    flop: String,
    turn: String,
    river: String,
    raise: String,
}

fn parse_spots(text: &str) -> Result<Vec<Spot>, String> {
    let mut out = Vec::new();
    for (n, line) in text.lines().enumerate() {
        let line = line.trim_end_matches('\r');
        if line.trim().is_empty() || line.starts_with('#') {
            continue;
        }
        let f: Vec<&str> = line.split('\t').collect();
        if f.len() != 10 {
            return Err(format!("Zeile {}: 10 Felder erwartet, {} gefunden", n + 1, f.len()));
        }
        out.push(Spot {
            id: f[0].into(),
            board: f[1].into(),
            pot: f[2].parse().map_err(|_| format!("Zeile {}: Pot", n + 1))?,
            eff: f[3].parse().map_err(|_| format!("Zeile {}: Stack", n + 1))?,
            oop: f[4].into(),
            ip: f[5].into(),
            flop: f[6].into(),
            turn: f[7].into(),
            river: f[8].into(),
            raise: f[9].into(),
        });
    }
    Ok(out)
}

fn json_str(s: &str) -> String {
    let mut o = String::from("\"");
    for ch in s.chars() {
        match ch {
            '"' => o.push_str("\\\""),
            '\\' => o.push_str("\\\\"),
            c => o.push(c),
        }
    }
    o.push('"');
    o
}

fn action_str(a: &Action) -> String {
    match a {
        Action::Fold => "F".into(),
        Action::Check => "X".into(),
        Action::Call => "C".into(),
        Action::Bet(v) => format!("B{}", v),
        Action::Raise(v) => format!("R{}", v),
        Action::AllIn(v) => format!("A{}", v),
        other => format!("{:?}", other),
    }
}

/// Flop-Knoten bis `depth` Aktionen tief einsammeln.
fn collect(game: &mut PostFlopGame, path: &mut Vec<usize>, depth: usize, out: &mut String, first: &mut bool) {
    if game.is_terminal_node() || game.is_chance_node() {
        return;
    }
    let actions = game.available_actions();
    let player = game.current_player();
    let n = game.private_cards(player).len();
    let strat = game.strategy();

    if !*first {
        out.push(',');
    }
    *first = false;
    let key = path.iter().map(|i| i.to_string()).collect::<Vec<_>>().join("-");
    let _ = write!(out, "\n    {}: {{\"p\": {}, \"a\": [", json_str(&key), player);
    let _ = write!(out, "{}", actions.iter().map(|a| json_str(&action_str(a))).collect::<Vec<_>>().join(","));
    out.push_str("], \"s\": [");
    for i in 0..actions.len() {
        if i > 0 {
            out.push(',');
        }
        out.push('[');
        let row: Vec<String> = (0..n).map(|j| ((strat[i * n + j] * 1000.0).round() as i32).to_string()).collect();
        out.push_str(&row.join(","));
        out.push(']');
    }
    out.push_str("]}");

    if depth == 0 {
        return;
    }
    for i in 0..actions.len() {
        // Nach Fold/Call ist die Straße zu Ende; nur Check/Bet/Raise führen weiter.
        if matches!(actions[i], Action::Fold | Action::Call) {
            continue;
        }
        let hist = game.history().to_vec();
        game.play(i);
        path.push(i);
        collect(game, path, depth - 1, out, first);
        path.pop();
        game.back_to_root();
        game.apply_history(&hist);
    }
}

fn solve_spot(s: &Spot, exploit_pct: f32, max_iter: u32) -> Result<String, String> {
    let card_config = CardConfig {
        range: [s.oop.parse()?, s.ip.parse()?],
        flop: flop_from_str(&s.board)?,
        turn: NOT_DEALT,
        river: NOT_DEALT,
    };
    let sizes = |b: &str| BetSizeOptions::try_from((b, s.raise.as_str()));
    let (f, t, r) = (sizes(&s.flop)?, sizes(&s.turn)?, sizes(&s.river)?);
    let tree_config = TreeConfig {
        initial_state: BoardState::Flop,
        starting_pot: s.pot,
        effective_stack: s.eff,
        rake_rate: 0.0,
        rake_cap: 0.0,
        flop_bet_sizes: [f.clone(), f],
        turn_bet_sizes: [t.clone(), t],
        river_bet_sizes: [r.clone(), r],
        turn_donk_sizes: None,
        river_donk_sizes: None,
        add_allin_threshold: 1.5,
        force_allin_threshold: 0.20,
        merging_threshold: 0.10,
    };
    let tree = ActionTree::new(tree_config)?;
    let mut game = PostFlopGame::with_config(card_config, tree)?;
    let (mem, mem_c) = game.memory_usage();
    let gb = |b: u64| b as f64 / 1024f64.powi(3);
    // Komprimiert, wenn unkomprimiert mehr als 4 GB nötig wären.
    let compress = gb(mem) > 4.0;
    eprintln!("  Speicher {:.2} GB ({:.2} GB komprimiert) -> {}", gb(mem), gb(mem_c), if compress { "komprimiert" } else { "32-bit" });
    game.allocate_memory(compress);

    let t0 = Instant::now();
    let target = s.pot as f32 * exploit_pct / 100.0;
    let expl = solve(&mut game, max_iter, target, false);
    let secs = t0.elapsed().as_secs_f64();
    eprintln!("  fertig in {:.0} s, Exploitability {:.3} ({:.2} % Pot)", secs, expl, 100.0 * expl / s.pot as f32);

    game.cache_normalized_weights();
    let mut out = String::new();
    let _ = write!(
        out,
        "{{\n  \"v\": 1, \"id\": {}, \"board\": {}, \"pot\": {}, \"eff\": {},\n  \"sizes\": {{\"flop\": {}, \"turn\": {}, \"river\": {}, \"raise\": {}}},\n  \"exploit\": {:.4}, \"exploitPct\": {:.3}, \"secs\": {:.0}, \"compressed\": {},\n  \"solver\": \"postflop-solver (b-inary), DCFR\",",
        json_str(&s.id), json_str(&s.board), s.pot, s.eff,
        json_str(&s.flop), json_str(&s.turn), json_str(&s.river), json_str(&s.raise),
        expl, 100.0 * expl / s.pot as f32, secs, compress
    );
    for p in 0..2 {
        let cards = holes_to_strings(game.private_cards(p))?;
        let w = game.normalized_weights(p);
        let _ = write!(
            out,
            "\n  {}: {{\"cards\": [{}], \"w\": [{}]}},",
            json_str(if p == 0 { "oop" } else { "ip" }),
            cards.iter().map(|c| json_str(c)).collect::<Vec<_>>().join(","),
            w.iter().map(|x| format!("{:.3}", x)).collect::<Vec<_>>().join(",")
        );
    }
    out.push_str("\n  \"nodes\": {");
    let mut first = true;
    game.back_to_root();
    collect(&mut game, &mut Vec::new(), 2, &mut out, &mut first);
    out.push_str("\n  }\n}\n");
    Ok(out)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        eprintln!("Aufruf: pt-solver-batch <spots.txt> <outdir> [--exploit 0.5] [--maxiter 1000] [--only <id>]");
        std::process::exit(2);
    }
    let mut exploit = 0.5f32;
    let mut max_iter = 1000u32;
    let mut only: Option<String> = None;
    let mut i = 3;
    while i < args.len() {
        match args[i].as_str() {
            "--exploit" => { exploit = args[i + 1].parse().expect("--exploit Zahl"); i += 2; }
            "--maxiter" => { max_iter = args[i + 1].parse().expect("--maxiter Zahl"); i += 2; }
            "--only" => { only = Some(args[i + 1].clone()); i += 2; }
            x => { eprintln!("Unbekannte Option {}", x); std::process::exit(2); }
        }
    }
    let text = std::fs::read_to_string(&args[1]).expect("spots.txt nicht lesbar");
    let spots = parse_spots(&text).unwrap_or_else(|e| { eprintln!("{}", e); std::process::exit(2) });
    std::fs::create_dir_all(&args[2]).expect("Ausgabeordner");
    let total = spots.len();
    let (mut done, mut skipped, mut failed) = (0, 0, 0);
    let t_all = Instant::now();
    for (k, s) in spots.iter().enumerate() {
        if let Some(o) = &only { if &s.id != o { continue; } }
        let path = std::path::Path::new(&args[2]).join(format!("{}.json", s.id));
        if path.exists() && only.is_none() {
            skipped += 1;
            continue;
        }
        eprintln!("[{}/{}] {}", k + 1, total, s.id);
        match solve_spot(s, exploit, max_iter) {
            Ok(json) => {
                let tmp = path.with_extension("json.tmp");
                std::fs::write(&tmp, json).expect("schreiben");
                std::fs::rename(&tmp, &path).expect("umbenennen");
                done += 1;
            }
            Err(e) => { eprintln!("  FEHLER: {}", e); failed += 1; }
        }
    }
    eprintln!("Fertig: {} gerechnet, {} übersprungen, {} Fehler, {:.0} min", done, skipped, failed, t_all.elapsed().as_secs_f64() / 60.0);
    if failed > 0 { std::process::exit(1); }
}
