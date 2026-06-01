import config as cfg
import fit
import pymc as pm

df = fit.load_matches(for_fit=True)
teams, idx = fit.build_team_index(df)
rho = fit.estimate_rho(df)
print("rho:", rho)
m = fit.build_model(df, teams, idx)
print("model built OK")
with m:
    tr = pm.sample(draws=150, tune=150, chains=2, target_accept=0.9,
                   random_seed=1, progressbar=False,
                   compute_convergence_checks=False)
print("sampled OK")
p = fit.export_params(tr, teams, idx, rho)
print("teams in params:", len(p["teams"]))
print("ITA:", p["teams"].get("ITA"))
print("ESP:", p["teams"].get("ESP"))
print("global:", p["global"])
