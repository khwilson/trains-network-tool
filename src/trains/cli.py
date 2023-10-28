import csv
import json

import click
import geopandas as gpd
import pandas as pd
import us


@click.group()
def cli():
    pass


@cli.command("merge")
@click.argument("infile")
@click.argument("outfile")
def merge_command(infile: str, outfile: str):
    with open(infile, "rb") as inf:
        j = json.load(inf)

    new_states = []

    for prov in j["objects"]["canadaprov"]["geometries"]:
        prov["properties"]["abbr"] = prov["id"][-2:]
        prov["properties"]["country"] = "CA"
        new_states.append(prov)

    for state in j["objects"]["states"]["geometries"]:
        state["properties"]["country"] = "US"
        if state["id"] == "11":
            # This is DC. Special case
            state["properties"]["abbr"] = "DC"
            new_states.append(state)
        elif (foo := us.states.lookup(state["id"])) and foo.is_continental:
            state["properties"]["abbr"] = foo.abbr
            new_states.append(state)
        else:
            continue

    j["objects"]["states"]["geometries"] = new_states
    del j["objects"]["canadaprov"]

    with open(outfile, "wt") as outf:
        json.dump(j, outf)


@cli.command("extract-canada")
@click.argument("modelfile")
@click.argument("dbfile")
@click.argument("outfile")
def extract_us_command(modelfile: str, dbfile: str, outfile: str):
    # Load the db of Canadian cities
    db_df = pd.read_csv(dbfile).sort_values(by=["city_ascii", "province_id"])
    db_df_dedupe = db_df.drop_duplicates()
    assert len(db_df) == len(db_df_dedupe)

    # Rename and only keep our cities
    db_df = db_df[["city_ascii", "province_id", "lng", "lat"]].rename(
        columns={
            "city_ascii": "city",
            "province_id": "state",
        }
    )
    db_df = db_df[db_df["city"].isin(["Toronto", "Ottawa", "Montreal"])]

    # Read CSA populations from input
    population_df = pd.read_excel(modelfile, sheet_name="INPUT Population", skiprows=3)[
        ["Short Name", "Population, millions"]
    ]
    population_df = population_df.rename(
        columns={
            "Short Name": "city",
            "Population, millions": "population",
        }
    )
    population_df["population"] = (population_df["population"] * 1e6).astype(int)

    merged_df = db_df.merge(population_df, how="left", on="city", indicator=True)
    assert (merged_df["_merge"] == "both").all()

    gdf = gpd.GeoDataFrame(
        merged_df, geometry=gpd.points_from_xy(merged_df["lng"], merged_df["lat"])
    )
    gdf[["city", "state", "population", "geometry"]].to_file(
        outfile, driver="GeoJSON", index=False
    )


@cli.command("extract-us")
@click.argument("modelfile")
@click.argument("dbfile")
@click.argument("renamefile")
@click.argument("outfile")
def extract_us_command(modelfile: str, dbfile: str, renamefile: str, outfile: str):
    rename_df = pd.read_csv(renamefile)

    # Ignore Candadian cities here
    rename_df = rename_df[~rename_df["city"].isin(["Toronto", "Montreal", "Ottawa"])]

    # Load the db of US cities
    db_df = pd.read_csv(dbfile).sort_values(by=["city_ascii", "state_name"])

    db_df_dedupe = db_df.drop_duplicates()

    # This fails as the database has duplictes. But it doesn't affect our cities
    # assert len(db_df) == len(db_df_dedeupe)

    merged_df = rename_df.merge(
        db_df_dedupe,
        how="left",
        left_on=["city", "state"],
        right_on=["city_ascii", "state_id"],
        indicator=True,
    )
    assert (merged_df["_merge"] == "both").all()
    merged_df = merged_df[["city_orig", "city_ascii", "state", "lng", "lat"]].rename(
        columns={"city_ascii": "city"}
    )

    # Read CSA populations from input
    population_df = pd.read_excel(modelfile, sheet_name="INPUT Population", skiprows=3)[
        ["Short Name", "Population, millions"]
    ]
    population_df = population_df.rename(
        columns={
            "Short Name": "city_orig",
            "Population, millions": "population",
        }
    )
    population_df["population"] = (population_df["population"] * 1e6).astype(int)

    merged_df = merged_df.merge(population_df, on="city_orig", indicator=True)
    assert (merged_df["_merge"] == "both").all()

    gdf = gpd.GeoDataFrame(
        merged_df, geometry=gpd.points_from_xy(merged_df["lng"], merged_df["lat"])
    )
    gdf = gdf[["city", "state", "population", "geometry"]]
    gdf.to_file(outfile, index=False, driver="GeoJSON")


@cli.command("final-merge")
@click.argument("uscities")
@click.argument("canadacities")
@click.argument("outfile")
def final_merge_command(uscities: str, canadacities: str, outfile: str):
    u_df = gpd.read_file(uscities)
    c_df = gpd.read_file(canadacities)
    pd.concat([u_df, c_df]).to_file(outfile)


@cli.command("segments")
@click.argument("modelfile")
@click.argument("renamefile")
@click.argument("outfile")
def segments_command(modelfile: str, renamefile: str, outfile: str):
    df = pd.read_excel(modelfile, sheet_name="INPUT Track Segments", skiprows=3)
    df = df.rename(columns={
        "From": "from_city",
        "To": "to_city",
        "Distance": "distance",
        "Cost, billions": "cost",
    })[["from_city", "to_city", "distance", "cost"]]
    df["cost"] = (df["cost"] * 1e9).astype(int)

    rename_df = pd.read_csv(renamefile)
    mapper = dict(rename_df[["city_orig", "city"]].values)
    df["from_city"] = df["from_city"].map(mapper)
    df["to_city"] = df["to_city"].map(mapper)

    with open(outfile, "wt") as outf:
        writer = csv.writer(outf)
        writer.writerow(["from_city", "to_city", "distance", "cost"])
        for _, row in df.iterrows():
            writer.writerow([row["from_city"], row["to_city"], row["distance"], row["cost"]])


if __name__ == "__main__":
    cli()
