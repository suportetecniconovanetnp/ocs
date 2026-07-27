%%% ocs_charging_SUITE.erl
%%% vim: ts=3
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%% @copyright 2016 - 2026 SigScale Global Inc.
%%% @end
%%% Licensed under the Apache License, Version 2.0 (the "License");
%%% you may not use this file except in compliance with the License.
%%% You may obtain a copy of the License at
%%%
%%%     http://www.apache.org/licenses/LICENSE-2.0
%%%
%%% Unless required by applicable law or agreed to in writing, software
%%% distributed under the License is distributed on an "AS IS" BASIS,
%%% WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
%%% See the License for the specific language governing permissions and
%%% limitations under the License.
%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%%
%%%  @doc Test suite for charging in {@link //ocs. ocs} application.
%%%
-module(ocs_charging_SUITE).
-copyright('Copyright (c) 2016 - 2026 SigScale Global Inc.').

%% common_test required callbacks
-export([suite/0, sequences/0, all/0]).
-export([init_per_suite/1, end_per_suite/1]).
-export([init_per_testcase/2, end_per_testcase/2]).

-behaviour(ct_suite).

%% Note: This directive should only be used in test suites.
-compile(export_all).

-include("ocs.hrl").
-include_lib("common_test/include/ct.hrl").

%%---------------------------------------------------------------------
%%  Test server callback functions
%%---------------------------------------------------------------------

-spec suite() -> DefaultData :: [tuple()].
%% Require variables and set default values for the suite.
%%
suite() ->
	[{userdata, [{doc, "Test suite for charging in OCS"}]},
	{timetrap, {minutes, 1}}].

-spec init_per_suite(Config :: [tuple()]) -> Config :: [tuple()].
%% Initialization before the whole suite.
%%
init_per_suite(Config) ->
	ok = ocs_test_lib:initialize_db(),
	ok = ocs_test_lib:start(),
	Config.

-spec end_per_suite(Config :: [tuple()]) -> any().
%% Cleanup after the whole suite.
%%
end_per_suite(Config) ->
	ok = ocs_test_lib:stop(),
	Config.

-spec init_per_testcase(TestCase :: atom(), Config :: [tuple()]) -> Config :: [tuple()].
%% Initialization before each test case.
%%
init_per_testcase(_TestCase, Config) ->
	Config.

-spec end_per_testcase(TestCase :: atom(), Config :: [tuple()]) -> any().
%% Cleanup after each test case.
%%
end_per_testcase(_TestCase, _Config) ->
	ok.

-spec sequences() -> Sequences :: [{SeqName :: atom(), Testcases :: [atom()]}].
%% Group test cases into a test sequence.
%%
sequences() -> 
	[].

-spec all() -> TestCases :: [Case :: atom()].
%% Returns a list of all test cases in this test suite.
%%
all() -> 
	[add_once, add_once_bundle, add_once_allowance,
			add_once_allowance_bundle, add_recurring,
			add_recurring_bundle, add_recurring_allowance,
			add_recurring_allowance_fixed_day,
			add_recurring_usage_allowance, add_once_usage_allowance,
			add_once_tariff_allowance, add_recurring_tariff_allowance,
			add_usage_once_allowance, add_usage_recurring_allowance,
			add_once_recurring_allowance,
			add_recurring_allowance_bundle,
			end_period_monthly_fixed_day,
			end_period_monthly_forced_day_time,
			recurring_charge_monthly_forced_alignment,
			recurring_charge_monthly, recurring_charge_hourly,
			recurring_charge_yearly, recurring_charge_daily].

%%---------------------------------------------------------------------
%%  Test cases
%%---------------------------------------------------------------------

add_once() ->
	[{userdata, [{doc, "One time charges at subscription instantiation"}]}].

add_once(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	Amount1 = 1900,
	Price1 = one_time(SD, Amount1),
	Amount2 = 100,
	Price2 = one_time(SD, Amount2),
	Prices = [Price1, Price2],
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = Prices},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	F = fun() ->
				[mnesia:read(bucket, I, read) || I <- BRefs]
	end,
	{atomic, Buckets} = mnesia:transaction(F),
	RemainAmounts = [B#bucket.remain_amount
			|| [B] <- Buckets, B#bucket.units == cents],
	Charge = 0 - Amount1 - Amount2,
	Charge = lists:sum(RemainAmounts).

add_once_bundle() ->
	[{userdata, [{doc, "One time charges instantiating product bundle"}]}].

add_once_bundle(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId1 = ocs:generate_password(),
	Amount1 = 1900,
	Price1 = one_time(SD, Amount1),
	Offer1 = #offer{name = OfferId1, status = active,
			specification = 8, price = [Price1]},
	{ok, _} = ocs:add_offer(Offer1),
	OfferId2 = ocs:generate_password(),
	Amount2 = 100,
	Price2 = one_time(SD, Amount2),
	Offer2 = #offer{name = OfferId2, status = active,
			specification = 9, price = [Price2]},
	{ok, _} = ocs:add_offer(Offer2),
	BundleName = ocs:generate_password(),
	Bundled1 = #bundled_po{name = OfferId1, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	Bundled2 = #bundled_po{name = OfferId2, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	Amount3 = 1000,
	Price3 = one_time(SD, Amount3),
	Bundle = #offer{name = BundleName, status = active,
			bundle = [Bundled1, Bundled2], price = [Price3]},
	{ok, _} = ocs:add_offer(Bundle),
	{ok, #product{balance = BRefs}} = ocs:add_product(BundleName, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	Amount4 = Amount1 + Amount2 + Amount3,
	{_, #bucket{remain_amount = Amount5}, []} = lists:keytake(cents,
			#bucket.units, Buckets),
	0 = Amount5 + Amount4.

add_once_allowance() ->
	[{userdata, [{doc, "One time allowances at subscription instantiation"}]}].

add_once_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 100000000000,
	Alteration = alteration(SD, one_time, undefined, octets, UnitSize, 0),
	Amount = 1000,
	Price = one_time(SD, Amount, Alteration),
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -1000}, Buckets1} = lists:keytake(cents,
			#bucket.units, Buckets),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets1).

add_once_allowance_bundle() ->
	[{userdata, [{doc, "One time allowances at instantiation of product bundle"}]}].

add_once_allowance_bundle(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId1 = ocs:generate_password(),
	UnitSize1 = 100000000000,
	Alteration1 = alteration(SD, one_time, undefined, octets, UnitSize1, 0),
	Amount1 = 1000,
	Price1 = one_time(SD, Amount1, Alteration1),
	Offer1 = #offer{name = OfferId1, status = active,
			specification = 8, price = [Price1]},
	{ok, _} = ocs:add_offer(Offer1),
	OfferId2 = ocs:generate_password(),
	UnitSize2 = 36000,
	Alteration2 = alteration(SD, one_time, undefined, seconds, UnitSize2, 0),
	Amount2 = 1000,
	Price2 = one_time(SD, Amount2, Alteration2),
	Offer2 = #offer{name = OfferId2, status = active,
			specification = 9, price = [Price2]},
	{ok, _} = ocs:add_offer(Offer2),
	BundleName = ocs:generate_password(),
	Bundled1 = #bundled_po{name = OfferId1, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	Bundled2 = #bundled_po{name = OfferId2, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	UnitSize3 = 2000000000,
	Alteration3 = alteration(SD, one_time, undefined, octets, UnitSize3, 0),
	Amount3 = 100,
	Price3 = one_time(SD, Amount3, Alteration3),
	UnitSize4 = 3600,
	Alteration4 = alteration(SD, one_time, undefined, seconds, UnitSize4, 0),
	Amount4 = 100,
	Price4 = one_time(SD, Amount4, Alteration4),
	Bundle = #offer{name = BundleName, status = active,
			bundle = [Bundled1, Bundled2], price = [Price3, Price4]},
	{ok, _} = ocs:add_offer(Bundle),
	{ok, #product{balance = BRefs}} = ocs:add_product(BundleName, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	Amount5 = Amount1 + Amount2 + Amount3 + Amount4,
	{_, #bucket{remain_amount = Amount6}, Buckets1} = lists:keytake(cents,
			#bucket.units, Buckets),
	0 = Amount6 + Amount5,
	F = fun(#bucket{units = Units, remain_amount = Amount}, {Units, N}) ->
				{Units, N + Amount};
			(_, Acc) ->
				Acc
	end,
	UnitSize5 = UnitSize1 + UnitSize3,
	{_, UnitSize5} = lists:foldl(F, {octets, 0}, Buckets1),
	UnitSize6 = UnitSize2 + UnitSize4,
	{_, UnitSize6} = lists:foldl(F, {seconds, 0}, Buckets1).

add_recurring() ->
	[{userdata, [{doc, "Recurring charges at subscription instantiation"}]}].

add_recurring(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	Amount1 = 2995,
	Price1 = recurring(SD, monthly, Amount1, undefined),
	Amount2 = 5,
	Price2 = recurring(SD, hourly, Amount2, undefined),
	Prices = [Price1, Price2],
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = Prices},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	Amount3 = Amount1 + Amount2,
	{_, #bucket{remain_amount = Amount4}, []} = lists:keytake(cents,
			#bucket.units, Buckets),
	0 = Amount4 + Amount3.

add_recurring_bundle() ->
	[{userdata, [{doc, "Recurring charges instantiating product bundle"}]}].

add_recurring_bundle(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId1 = ocs:generate_password(),
	Amount1 = 2995,
	Price1 = recurring(SD, monthly, Amount1, undefined),
	Offer1 = #offer{name = OfferId1, status = active,
			specification = 8, price = [Price1]},
	{ok, _} = ocs:add_offer(Offer1),
	Amount2 = 5,
	Price2 = recurring(SD, hourly, Amount2, undefined),
	OfferId2 = ocs:generate_password(),
	Offer2 = #offer{name = OfferId2, status = active,
			specification = 9, price = [Price2]},
	{ok, _} = ocs:add_offer(Offer2),
	BundleName = ocs:generate_password(),
	Bundled1 = #bundled_po{name = OfferId1, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	Bundled2 = #bundled_po{name = OfferId2, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	Amount3 = 1000,
	Price3 = recurring(SD, yearly, Amount3, undefined),
	Bundle = #offer{name = BundleName, status = active,
			bundle = [Bundled1, Bundled2], price = [Price3]},
	{ok, _} = ocs:add_offer(Bundle),
	{ok, #product{balance = BRefs}} = ocs:add_product(BundleName, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	Amount4 = Amount1 + Amount2 + Amount3,
	{_, #bucket{remain_amount = Amount5}, []} = lists:keytake(cents,
			#bucket.units, Buckets),
	0 = Amount5 + Amount4.

add_recurring_allowance() ->
	[{userdata, [{doc, "Recurring allowances at subscription instantiation"}]}].

add_recurring_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 100000000000,
	Alteration = alteration(SD, recurring, monthly, octets, UnitSize, 0),
	Amount = 1000,
	Price = recurring(SD, monthly, Amount, Alteration),
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -1000}, Buckets1} = lists:keytake(cents,
			#bucket.units, Buckets),
	EndDate = ocs:end_period(SD, monthly),
	{_, #bucket{remain_amount = UnitSize, end_date = EndDate}, []}
			= lists:keytake(octets, #bucket.units, Buckets1).

add_recurring_allowance_fixed_day() ->
	[{userdata, [{doc, "Recurring allowances can use a fixed monthly renewal day"}]}].

add_recurring_allowance_fixed_day(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 100000000000,
	MonthDay = 30,
	Alteration = (alteration(SD, recurring, monthly, octets, UnitSize, 0))#alteration{
			month_day = MonthDay},
	Amount = 1000,
	Price = (recurring(SD, monthly, Amount, Alteration))#price{month_day = MonthDay},
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -1000}, Buckets1} = lists:keytake(cents,
			#bucket.units, Buckets),
	EndDate = ocs:end_period(SD, monthly, MonthDay),
	{_, #bucket{remain_amount = UnitSize, end_date = EndDate}, []}
			= lists:keytake(octets, #bucket.units, Buckets1).

add_recurring_usage_allowance() ->
	[{userdata, [{doc, "Recurring allowances attached to usage price
			at subscription instantiation"}]}].

add_recurring_usage_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 100000000000,
	Amount = 1000,
	Alteration = alteration(SD, recurring, monthly, octets, UnitSize, Amount),
	Price = overage(SD, usage, octets, 100, 1000000000, Alteration),
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -1000}, Buckets2} = lists:keytake(cents,
			#bucket.units, Buckets),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets2).

add_once_usage_allowance() ->
	[{userdata, [{doc, "One time allowances attached to usage price
			at subscription instantiation"}]}].

add_once_usage_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 1000000000,
	Alteration = alteration(SD, one_time, undefined, octets, UnitSize, 0),
	Price = overage(SD, usage, octets, 100, 1000000000, Alteration),
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets).

add_once_tariff_allowance() ->
	[{userdata, [{doc, "One time allowances attached to tariff price
			at subscription instantiation"}]}].

add_once_tariff_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 100000000000,
	Alteration = alteration(SD, one_time, undefined, octets, UnitSize, 0),
	Price = #price{name = ocs:generate_identity(), start_date = SD,
			type = tariff, size = 1000000000, amount = 0,
			units = octets, alteration = Alteration},
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets).

add_recurring_tariff_allowance() ->
	[{userdata, [{doc, "Recurring allowances attached to tariff price
			at subscription instantiation"}]}].

add_recurring_tariff_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 100000000000,
	Amount = 1000,
	Alteration = alteration(SD, recurring, monthly, octets, UnitSize, Amount),
	Price = #price{name = ocs:generate_identity(), start_date = SD,
			type = tariff, size = 1000, amount = 0,
			units = seconds, alteration = Alteration},
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -1000}, Buckets2} = lists:keytake(cents,
			#bucket.units, Buckets),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets2).

add_usage_once_allowance() ->
	[{userdata, [{doc, "Usage allowances attached to one time price
			at subscription instantiation"}]}].

add_usage_once_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	Amount = 1000,
	UnitSize = 100000000000,
	Alteration = alteration(SD, usage, undefined, octets, UnitSize, Amount),
	Price = one_time(SD, Amount, Alteration),
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -2000}, Buckets2} = lists:keytake(cents,
			#bucket.units, Buckets),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets2).

add_usage_recurring_allowance() ->
	[{userdata, [{doc, "Usage allowances attached to recurring price
			at subscription instantiation"}]}].

add_usage_recurring_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	Amount = 1000,
	UnitSize = 100000000000,
	Alteration = alteration(SD, usage, undefined, octets, UnitSize, Amount),
	Price = recurring(SD, monthly, 0, Alteration),
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -1000}, Buckets2} = lists:keytake(cents,
			#bucket.units, Buckets),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets2).

add_once_recurring_allowance() ->
	[{userdata, [{doc, "Usage allowances attached to recurring price
			at subscription instantiation"}]}].

add_once_recurring_allowance(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	UnitSize = 100000000000,
	Alteration = alteration(SD, usage, undefined, octets, UnitSize, 1000),
	Price = recurring(SD, monthly, 100, Alteration),
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = [Price]},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{balance = BRefs}} = ocs:add_product(OfferId, []),
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	{_, #bucket{remain_amount = -1100}, Buckets2} = lists:keytake(cents,
			#bucket.units, Buckets),
	{_, #bucket{remain_amount = UnitSize}, []} = lists:keytake(octets,
			#bucket.units, Buckets2).

add_recurring_allowance_bundle() ->
	[{userdata, [{doc, "Recurring allowances at instantiation of product bundle"}]}].

add_recurring_allowance_bundle(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId1 = ocs:generate_password(),
	UnitSize1 = 100000000000,
	Alteration1 = alteration(SD, recurring, monthly, octets, UnitSize1, 0),
	Amount1 = 1000,
	Price1 = recurring(SD, monthly, Amount1, Alteration1),
	Offer1 = #offer{name = OfferId1, status = active,
			specification = 8, price = [Price1]},
	{ok, _} = ocs:add_offer(Offer1),
	OfferId2 = ocs:generate_password(),
	UnitSize2 = 36000,
	Alteration2 = alteration(SD, recurring, monthly, seconds, UnitSize2, 0),
	Amount2 = 1000,
	Price2 = recurring(SD, monthly, Amount2, Alteration2),
	Offer2 = #offer{name = OfferId2, status = active,
			specification = 9, price = [Price2]},
	{ok, _} = ocs:add_offer(Offer2),
	BundleName = ocs:generate_password(),
	Bundled1 = #bundled_po{name = OfferId1, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	Bundled2 = #bundled_po{name = OfferId2, status = active,
			lower_limit = 0, upper_limit = 1, default = 1},
	UnitSize3 = 2000000000,
	Alteration3 = alteration(SD, recurring, monthly, octets, UnitSize3, 0),
	Amount3 = 100,
	Price3 = recurring(SD, monthly, Amount3, Alteration3),
	UnitSize4 = 3600,
	Alteration4 = alteration(SD, recurring, monthly, seconds, UnitSize4, 0),
	Amount4 = 100,
	Price4 = recurring(SD, monthly, Amount4, Alteration4),
	Bundle = #offer{name = BundleName, status = active,
			bundle = [Bundled1, Bundled2], price = [Price3, Price4]},
	{ok, _} = ocs:add_offer(Bundle),
	{ok, #product{balance = BRefs}} = ocs:add_product(BundleName, []),
	Amount5 = Amount1 + Amount2 + Amount3 + Amount4,
	Buckets = lists:flatten([mnesia:dirty_read(bucket, BRef) || BRef <- BRefs]),
	F = fun(#bucket{units = Units, remain_amount = Amount}, {Units, N}) ->
				{Units, N + Amount};
			(_, Acc) ->
				Acc
	end,
	{_, Amount6} = lists:foldl(F, {cents, 0}, Buckets),
	0 = Amount5 + Amount6,
	UnitSize5 = UnitSize1 + UnitSize3,
	{_, UnitSize5} = lists:foldl(F, {octets, 0}, Buckets),
	UnitSize6 = UnitSize2 + UnitSize4,
	{_, UnitSize6} = lists:foldl(F, {seconds, 0}, Buckets).

recurring_charge_monthly() ->
	[{userdata, [{doc, "Recurring charges for monthly subscription"}]}].

recurring_charge_monthly(_Config) ->
	SD = erlang:system_time(millisecond),
	Amount1 = 2995,
	P1 = one_time(SD, Amount1),
	Amount2 = 100000000000,
	Alteration = alteration(SD, recurring, monthly, octets, Amount2, 0),
	Amount3 = 1250,
	P2 = recurring(SD, monthly, Amount3, Alteration),
	P3 = overage(SD, usage, octets, 100, 1000000000),
	Prices = [P1, P2, P3],
	OfferId = ocs:generate_identity(),
	Offer = #offer{name = OfferId, start_date = SD,
			status = active, price = Prices},
	{ok, _Offer1} = ocs:add_offer(Offer),
	{ok, #product{id = ProdId} = P} = ocs:add_product(OfferId, []),
	Expired = erlang:system_time(millisecond) - 3599000,
	ok = mnesia:dirty_write(product, P#product{payment =
			[{P2#price.name, Expired}]}),
	B1 = #bucket{units = cents, remain_amount = 10000000,
			attributes = #{bucket_type => normal},
			start_date = erlang:system_time(millisecond),
			end_date = erlang:system_time(millisecond) + 2592000000},
	{ok, _, #bucket{id = BId1}} = ocs:add_bucket(ProdId, B1),
	ok = ocs_scheduler:product_charge(),
	F1 = fun(BId) ->
				case ocs:find_bucket(BId) of
					{ok, #bucket{remain_amount = RM1}} when BId == BId1 ->
							RM1 == B1#bucket.remain_amount - P2#price.amount;
					{ok, #bucket{units = octets, remain_amount = RM1}} ->
							RM1 == Alteration#alteration.size;
					{ok, #bucket{units = cents, remain_amount = RM1}} ->
							RM1 == - (Amount1 + Amount3);
					_R ->
						false
				end
	end,
	{ok, #product{payment = Payments, balance = BRefs}} =
			ocs:find_product(ProdId),
	true = lists:all(F1, BRefs),
	F2 = fun({_, DueDate}) -> DueDate == ocs:end_period(Expired, monthly) end,
	true = lists:any(F2, Payments).

recurring_charge_hourly() ->
	[{userdata, [{doc, "Recurring charges for hourly subscription"}]}].

recurring_charge_hourly(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	Amount1 = 2995,
	P1 = recurring(SD, monthly, Amount1, undefined),
	Amount2 = 5,
	P2 = recurring(SD, hourly, Amount2, undefined),
	Prices = [P1, P2],
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = Prices},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{id = ProdId} = P} = ocs:add_product(OfferId, []),
	Expired = erlang:system_time(millisecond) - 3600000,
	ok = mnesia:dirty_write(product, P#product{payment =
			[{P2#price.name, Expired}]}),
	B1 = #bucket{units = cents, remain_amount = 10000000,
			attributes = #{bucket_type => normal},
			start_date = erlang:system_time(millisecond),
			end_date = erlang:system_time(millisecond) + 2592000000},
	{ok, _, #bucket{id = BId1}} = ocs:add_bucket(ProdId, B1),
	ok = ocs_scheduler:product_charge(),
	F1 = fun(BId) ->
				case ocs:find_bucket(BId) of
					{ok, #bucket{remain_amount = RM1}} when BId == BId1 ->
							RM1 == B1#bucket.remain_amount - (P2#price.amount * 2);
					{ok, #bucket{units = cents, remain_amount = RM1}} ->
							RM1 == - (Amount1 + Amount2);
					_R ->
						false
				end
	end,
	{ok, #product{payment = Payments, balance = BRefs}} =
			ocs:find_product(ProdId),
	true = lists:all(F1, BRefs),
	F2 = fun({_, DueDate}) ->
			EP1 = ocs:end_period(Expired, hourly),
			EP2 = ocs:end_period(EP1, hourly),
			DueDate == EP2
	end,
	true = lists:any(F2, Payments).

recurring_charge_yearly() ->
	[{userdata, [{doc, "Recurring charges for yearly subscription"}]}].

recurring_charge_yearly(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	Amount1 = 5,
	P1 = recurring(SD, monthly, Amount1, undefined),
	Amount2 = 2995,
	P2 = recurring(SD, yearly, Amount2, undefined),
	Prices = [P1, P2],
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = Prices},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{id = ProdId} = P} = ocs:add_product(OfferId, []),
	Expired = erlang:system_time(millisecond) - 315360,
	ok = mnesia:dirty_write(product, P#product{payment =
			[{P2#price.name, Expired}]}),
	B1 = #bucket{units = cents, remain_amount = 10000000,
			attributes = #{bucket_type => normal},
			start_date = erlang:system_time(millisecond),
			end_date = erlang:system_time(millisecond) + 2592000000},
	{ok, _, #bucket{id = BId1}} = ocs:add_bucket(ProdId, B1),
	ok = ocs_scheduler:product_charge(),
	F1 = fun(BId) ->
				case ocs:find_bucket(BId) of
					{ok, #bucket{remain_amount = RM1}} when BId == BId1 ->
							RM1 == B1#bucket.remain_amount - P2#price.amount;
					{ok, #bucket{units = cents, remain_amount = RM1}} ->
							RM1 == - (Amount1 + Amount2);
					_R ->
						false
				end
	end,
	{ok, #product{payment = Payments, balance = BRefs}} =
			ocs:find_product(ProdId),
	true = lists:all(F1, BRefs),
	F2 = fun({_, DueDate}) -> DueDate == ocs:end_period(Expired, yearly) end,
	true = lists:any(F2, Payments).

recurring_charge_daily() ->
	[{userdata, [{doc, "Recurring charges for daily subscription"}]}].

recurring_charge_daily(_Config) ->
	SD = erlang:system_time(millisecond),
	OfferId = ocs:generate_password(),
	Amount1 = 5,
	P1 = recurring(SD, monthly, Amount1, undefined),
	Amount2 = 100,
	P2 = recurring(SD, daily, Amount2, undefined),
	Prices = [P1, P2],
	Offer = #offer{name = OfferId, status = active,
			specification = 8, price = Prices},
	{ok, _} = ocs:add_offer(Offer),
	{ok, #product{id = ProdId} = P} = ocs:add_product(OfferId, []),
	Expired = erlang:system_time(millisecond) - 86400,
	ok = mnesia:dirty_write(product, P#product{payment = [{P2#price.name, Expired}]}),
	B1 = #bucket{units = cents, remain_amount = 10000000,
			attributes = #{bucket_type => normal},
			start_date = erlang:system_time(millisecond),
			end_date = erlang:system_time(millisecond) + 2592000000},
	{ok, _, #bucket{id = BId1}} = ocs:add_bucket(ProdId, B1),
	ok = ocs_scheduler:product_charge(),
	F1 = fun(BId) ->
				case ocs:find_bucket(BId) of
					{ok, #bucket{remain_amount = RM1}} when BId == BId1 ->
							RM1 == B1#bucket.remain_amount - P2#price.amount;
					{ok, #bucket{units = cents, remain_amount = RM1}} ->
							RM1 == - (Amount1 + Amount2);
					_R ->
						false
				end
	end,
	{ok, #product{payment = Payments, balance = BRefs}} =
			ocs:find_product(ProdId),
	true = lists:all(F1, BRefs),
	F2 = fun({_, DueDate}) -> DueDate == ocs:end_period(Expired, daily) end,
	true = lists:any(F2, Payments).

end_period_monthly_fixed_day() ->
	[{userdata, [{doc, "Fixed monthly renewal day clamps to the month's last day when needed"}]}].

end_period_monthly_fixed_day(_Config) ->
	JanMid2025 = system_time({{2025, 1, 15}, {12, 0, 0}}),
	ExpectedJan2025 = system_time({{2025, 1, 30}, {12, 0, 0}}) - 1,
	Jan2025 = system_time({{2025, 1, 30}, {12, 0, 0}}),
	ExpectedFeb2025 = system_time({{2025, 2, 28}, {12, 0, 0}}) - 1,
	Feb2028Start = system_time({{2028, 1, 30}, {12, 0, 0}}),
	ExpectedFeb2028 = system_time({{2028, 2, 29}, {12, 0, 0}}) - 1,
	Mar2025 = system_time({{2025, 3, 30}, {12, 0, 0}}),
	ExpectedApr2025 = system_time({{2025, 4, 30}, {12, 0, 0}}) - 1,
	ExpectedJan2025 = ocs:end_period(JanMid2025, monthly, 30),
	ExpectedFeb2025 = ocs:end_period(Jan2025, monthly, 30),
	ExpectedFeb2028 = ocs:end_period(Feb2028Start, monthly, 30),
	ExpectedApr2025 = ocs:end_period(Mar2025, monthly, 30),
	ok.

end_period_monthly_forced_day_time() ->
	[{userdata, [{doc, "Global monthly renewal override aligns to configured UTC day and time"}]}].

end_period_monthly_forced_day_time(_Config) ->
	with_force_monthly_renewal_override(28, {3, 0, 0},
			fun() ->
				JanBefore = system_time({{2025, 1, 15}, {12, 0, 0}}),
				ExpectedJan = system_time({{2025, 1, 28}, {3, 0, 0}}) - 1,
				JanAfter = system_time({{2025, 1, 30}, {12, 0, 0}}),
				ExpectedFeb = system_time({{2025, 2, 28}, {3, 0, 0}}) - 1,
				ExpectedJan = ocs:end_period(JanBefore, monthly, undefined),
				ExpectedFeb = ocs:end_period(JanAfter, monthly, undefined)
			end).

recurring_charge_monthly_forced_alignment() ->
	[{userdata, [{doc, "Scheduler can realign monthly recurring charges to a forced UTC day and time"}]}].

recurring_charge_monthly_forced_alignment(_Config) ->
	Now = erlang:system_time(millisecond),
	{{_Year, _Month, Day}, _Time} = date_time(Now),
	OverrideTime = {0, 0, 0},
	FutureDue = future_due_same_month(Now),
	with_force_monthly_renewal_override(Day, OverrideTime,
			fun() ->
				SD = erlang:system_time(millisecond),
				OfferId = ocs:generate_password(),
				Amount = 100,
				Price = recurring(SD, monthly, Amount, undefined),
				Offer = #offer{name = OfferId, status = active,
						specification = 8, price = [Price]},
				{ok, _} = ocs:add_offer(Offer),
				{ok, #product{id = ProdId} = Product} = ocs:add_product(OfferId, []),
				ok = mnesia:dirty_write(product, Product#product{payment =
						[{Price#price.name, FutureDue}]}),
				Bucket = #bucket{units = cents, remain_amount = 10000000,
						attributes = #{bucket_type => normal},
						start_date = erlang:system_time(millisecond),
						end_date = erlang:system_time(millisecond) + 2592000000},
				{ok, _, #bucket{id = BucketId}} = ocs:add_bucket(ProdId, Bucket),
				ok = ocs_scheduler:product_charge(),
				{ok, #product{payment = Payments}} = ocs:find_product(ProdId),
				{ok, #bucket{remain_amount = Remaining}} = ocs:find_bucket(BucketId),
				ExpectedDue = ocs:end_period(FutureDue, monthly, undefined),
				true = (Remaining == (10000000 - Amount)),
				true = lists:any(fun({Name, DueDate}) ->
						(Name == Price#price.name) andalso (DueDate == ExpectedDue)
				end, Payments)
			end).

%%---------------------------------------------------------------------
%%  Internal functions
%%---------------------------------------------------------------------

one_time(SD, Amount) ->
	one_time(SD, Amount, undefined).
one_time(SD, Amount, Alter) ->
	#price{name = ocs:generate_identity(),
			start_date = SD, type = one_time,
			amount = Amount, alteration = Alter}.

recurring(SD, Period, Amount, Alteration) ->
	#price{name = ocs:generate_identity(),
			start_date = SD, type = recurring, period = Period,
			amount = Amount, alteration = Alteration}.

overage(SD, Type, Units, Amount, Size) ->
	overage(SD, Type, Units, Amount, Size, undefined).
overage(SD, Type, Units, Amount, Size, Alter) ->
	#price{name = ocs:generate_identity(),
			start_date = SD, type = Type, size = Size,
			amount = Amount, units = Units, alteration = Alter}.

alteration(SD, Type, Units, Size) ->
	alteration(SD, Type, undefined, Units, Size, 0).
alteration(SD, Type, Period, Units, Size, Amount) ->
	#alteration{name = ocs:generate_identity(),
			start_date = SD, type = Type, period = Period,
			units = Units, size = Size, amount = Amount}.

system_time(DateTime) ->
	Seconds = calendar:datetime_to_gregorian_seconds(DateTime) - 62167219200,
	erlang:convert_time_unit(Seconds, second, millisecond).

date_time(MilliSeconds) ->
	Seconds = 62167219200 + (MilliSeconds div 1000),
	calendar:gregorian_seconds_to_datetime(Seconds).

future_due_same_month(Now) ->
	{{Year, Month, Day}, {Hour, Minute, Second}} = date_time(Now),
	LastDay = calendar:last_day_of_the_month(Year, Month),
	DateTime = case Day < LastDay of
		true ->
			{{Year, Month, Day + 1}, {12, 0, 0}};
		false when Hour < 23 ->
			{{Year, Month, Day}, {23, Minute, Second}};
		false when Minute < 59 ->
			{{Year, Month, Day}, {Hour, 59, Second}};
		false ->
			{{Year, Month, Day}, {Hour, Minute, 59}}
	end,
	system_time(DateTime).

with_force_monthly_renewal_override(Day, Time, Fun) ->
	PrevEnabled = application:get_env(ocs, force_monthly_renewal_enabled),
	PrevDay = application:get_env(ocs, force_monthly_renewal_day),
	PrevTime = application:get_env(ocs, force_monthly_renewal_time),
	ok = application:set_env(ocs, force_monthly_renewal_enabled, true),
	ok = application:set_env(ocs, force_monthly_renewal_day, Day),
	ok = application:set_env(ocs, force_monthly_renewal_time, Time),
	try
		Fun()
	after
		restore_env(force_monthly_renewal_enabled, PrevEnabled),
		restore_env(force_monthly_renewal_day, PrevDay),
		restore_env(force_monthly_renewal_time, PrevTime)
	end.

restore_env(Key, {ok, Value}) ->
	application:set_env(ocs, Key, Value);
restore_env(Key, undefined) ->
	application:unset_env(ocs, Key);
restore_env(Key, error) ->
	application:unset_env(ocs, Key).
