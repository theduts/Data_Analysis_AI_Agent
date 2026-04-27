import urllib.request

url = "https://raw.githubusercontent.com/codeforamerica/click_that_hood/master/public/data/brazil-states.topojson"
urllib.request.urlretrieve(url, "brazil-states.topojson")
print("Downloaded brazil-states.topojson")
