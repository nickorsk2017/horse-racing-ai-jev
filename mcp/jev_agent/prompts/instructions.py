"""Texts the agent sends: MCP server instructions and the Jev question."""

SERVER_INSTRUCTIONS = (
    "Jev (TypeSafe AI System One model) predicts win probabilities for a horse race. "
    "Input: the public briefing (weather, distance, horses, rules in plain text) and, during the race, "
    "a live snapshot (distance run, observed pace, finish places, falls, visible incidents with time and place). "
    "Without a snapshot the prediction is pre-race, with a snapshot it is live. "
    "Use predict_race for one query and predict_races for a batch."
)

WINNER_QUESTION = (
    "Which horse wins this race, that is, crosses the finish line first. "
    "Judge from the rules, the horses and, when the race is in progress, the live standings. "
    "A horse that fell is out of the race and cannot win. "
    "A horse that already finished first has won. "
    "Live standings give each running horse its observed pace (speed_m_s), the time to finish at that pace (eta_s) "
    "and how fast it gains on the leader (gaining_on_leader_m_s, negative means it drops back). "
    "The order the horses reach the line is decided by pace over the remaining distance, not by the current position: "
    "a trailing horse that is faster can pass the leader before the line. "
    "Adjust the pace for what happens next: a winded horse keeps slowing down to the finish, "
    "strength matters in the final sprint, an old bad start no longer matters."
)
