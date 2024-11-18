const negativeGlyphs = ["uni24EB", "uni24EC", "uni24ED", "uni24EE", "uni24EF", "uni24F0", "uni24F1", "uni24F2", "uni24F3", "uni24F4", "uni2776", "uni2777", 
"uni2778", "uni2779", "uni277A", "uni277B", "uni277C", "uni277D", "uni277E", "uni277F", "uni3015", "uni3016", "uni3017", "uni301E", "uni1F150", "uni1F151", "uni1F152", 
"uni1F153", "uni1F154", "uni1F155", "uni1F156", "uni1F157", "uni1F158", "uni1F159", "uni1F15A", "uni1F15B", "uni1F15C", "uni1F15D", "uni1F15E", "uni1F15F", 
"uni1F160", "uni1F161", "uni1F162", "uni1F163", "uni1F164", "uni1F165", "uni1F166", "uni1F167", "uni1F168", "uni1F169", "uni1F170", "uni1F171", "uni1F172", 
"uni1F173", "uni1F174", "uni1F175", "uni1F176", "uni1F177", "uni1F178", "uni1F179", "uni1F17A", "uni1F17B", "uni1F17C", "uni1F17D", "uni1F17E", "uni1F17F", 
"uni1F180", "uni1F181", "uni1F182", "uni1F183", "uni1F184", "uni1F185", "uni1F186", "uni1F187", "uni1F188", "uni1F189", "uni1F18B", "uni1F18C", 
"uni1F18D", "uni1F18E", "uni1F18F", "registered", "caron", "uni02CA", "uni02CB", "gravecomb", "acutecomb", "uni030C", "uni3025", "uni311F", "uni31DD"];

const skipGlyphs = ["uni23BE", "uni23BF", "uni23C0", "uni23C1", "uni23C2", "uni23C3", "uni23C4", "uni23C5", "uni23C6", "uni23C7", "uni23C8", "uni23C9", "uni23CA", "uni23CB", "uni23CC", "uni2500", "uni2501", "uni2502", "uni2503", "uni2504", "uni2505", "uni2506", "uni2507", "uni2508", "uni2509", "uni250A", "uni250B", 
"uni250C", "uni250D", "uni250E", "uni250F", "uni2510", "uni2511", "uni2512", "uni2513", "uni2514", "uni2515", "uni2516", "uni2517", "uni2518", "uni2519", 
"uni251A", "uni251B", "uni251C", "uni251D", "uni251E", "uni251F", "uni2520", "uni2521", "uni2522", "uni2523", "uni2524", "uni2525", "uni2526", "uni2527", 
"uni2528", "uni2529", "uni252A", "uni252B", "uni252C", "uni252D", "uni252E", "uni252F", "uni2530", "uni2531", "uni2532", "uni2533", "uni2534", "uni2535", 
"uni2536", "uni2537", "uni2538", "uni2539", "uni253A", "uni253B", "uni253C", "uni253D", "uni253E", "uni253F", "uni2540", "uni2541", "uni2542", "uni2543", 
"uni2544", "uni2545", "uni2546", "uni2547", "uni2548", "uni2549", "uni254A", "uni254B", "uni254C", "uni254D", "uni254E", "uni254F", "uni2550", "uni2551", 
"uni2552", "uni2553", "uni2554", "uni2555", "uni2556", "uni2557", "uni2558", "uni2559", "uni255A", "uni255B", "uni255C", "uni255D", "uni255E", "uni255F", 
"uni2560", "uni2561", "uni2562", "uni2563", "uni2564", "uni2565", "uni2566", "uni2567", "uni2568", "uni2569", "uni256A", "uni256B", "uni256C", "uni256D", 
"uni256E", "uni256F", "uni2570", "uni2571", "uni2572", "uni2573", "uni2574", "uni2575", "uni2576", "uni2577", "uni2578", "uni2579", "uni257A", "uni257B", 
"uni257C", "uni257D", "uni257E", "uni257F", "uni2580", "uni2581", "uni2582", "uni2583", "uni2584", "uni2585", "uni2586", "uni2587", "uni2588", "uni2589", 
"uni258A", "uni258B", "uni258C", "uni258D", "uni258E", "uni258F", "uni2590", "uni2591", "uni2592", "uni2593", "uni2594", "uni2595", "uni2596", "uni2597", 
"uni2598", "uni2599", "uni259A", "uni259B", "uni259C", "uni259D", "uni259E", "uni259F", "uni25A0", "uni25A1", "uni25A2", "uni25A3", "uni25A4", "uni25A5", 
"uni25A6", "uni25A7", "uni25A8", "uni25A9", "uni25AA", "uni25AB", "uni25AC", "uni25AD", "uni25AE", "uni25AF", "uni25B0", "uni25B1", "uni25B2", "uni25B3", 
"uni25B4", "uni25B5", "uni25B6", "uni25B7", "uni25B8", "uni25B9", "uni25BA", "uni25BB", "uni25BC", "uni25BD", "uni25BE", "uni25BF", "uni25C0", "uni25C1", 
"uni25C2", "uni25C3", "uni25C4", "uni25C5", "uni25C6", "uni25C7", "uni25C8", "uni25C9", "uni25CA", "uni25CB", "uni25CC", "uni25CD", "uni25CE", "uni25CF", 
"uni25D0", "uni25D1", "uni25D2", "uni25D3", "uni25D4", "uni25D5", "uni25D6", "uni25D7", "uni25D8", "uni25D9", "uni25DA", "uni25DB", "uni25DC", "uni25DD", 
"uni25DE", "uni25DF", "uni25E0", "uni25E1", "uni25E2", "uni25E3", "uni25E4", "uni25E5", "uni25E6", "uni25E7", "uni25E8", "uni25E9", "uni25EA", "uni25EB", 
"uni25EC", "uni25ED", "uni25EE", "uni25EF", "uni25F0", "uni25F1", "uni25F2", "uni25F3", "uni25F4", "uni25F5", "uni25F6", "uni25F7", "uni25F8", "uni25F9", 
"uni25FA", "uni25FB", "uni25FC", "uni25FD", "uni25FE", "uni25FF", "uni2600", "uni2601", "uni2602", "uni2603", "uni2604", "uni2605", "uni2606", "uni2607", 
"uni2608", "uni2609", "uni260A", "uni260B", "uni260C", "uni260D", "uni260E", "uni260F", "uni2610", "uni2611", "uni2612", "uni2613", "uni2614", "uni2615", 
"uni2616", "uni2617", "uni2618", "uni2619", "uni261A", "uni261B", "uni261C", "uni261D", "uni261E", "uni261F", "uni2620", "uni2621", "uni2622", "uni2623", 
"uni2624", "uni2625", "uni2626", "uni2627", "uni2628", "uni2629", "uni262A", "uni262B", "uni262C", "uni262D", "uni262E", "uni262F", "uni2630", "uni2631", 
"uni2632", "uni2633", "uni2634", "uni2635", "uni2636", "uni2637", "uni2638", "uni2639", "uni263A", "uni263B", "uni263C", "uni263D", "uni263E", "uni263F", 
"uni2640", "uni2641", "uni2642", "uni2643", "uni2644", "uni2645", "uni2646", "uni2647", "uni2648", "uni2649", "uni264A", "uni264B", "uni264C", "uni264D", 
"uni264E", "uni264F", "uni2650", "uni2651", "uni2652", "uni2653", "uni2654", "uni2655", "uni2656", "uni2657", "uni2658", "uni2659", "uni265A", "uni265B", 
"uni265C", "uni265D", "uni265E", "uni265F", "uni2660", "uni2661", "uni2662", "uni2663", "uni2664", "uni2665", "uni2666", "uni2667", "uni2668", "uni2669", 
"uni266A", "uni266B", "uni266C", "uni266D", "uni266E", "uni266F", "uni2670", "uni2671", "uni2672", "uni2673", "uni2674", "uni2675", "uni2676", "uni2677", 
"uni2678", "uni2679", "uni267A", "uni267B", "uni267C", "uni267D", "uni267E", "uni267F", "uni2680", "uni2681", "uni2682", "uni2683", "uni2684", "uni2685", 
"uni2686", "uni2687", "uni2688", "uni2689", "uni268A", "uni268B", "uni268C", "uni268D", "uni268E", "uni268F", "uni2690", "uni2691", "uni2692", "uni2693", 
"uni2694", "uni2695", "uni2696", "uni2697", "uni2698", "uni2699", "uni269A", "uni269B", "uni269C", "uni269D", "uni269E", "uni269F", "uni26A0", "uni26A1", 
"uni26A2", "uni26A3", "uni26A4", "uni26A5", "uni26A6", "uni26A7", "uni26A8", "uni26A9", "uni26AA", "uni26AB", "uni26AC", "uni26AD", "uni26AE", "uni26AF", 
"uni26B0", "uni26B1", "uni26B2", "uni26B3", "uni26B4", "uni26B5", "uni26B6", "uni26B7", "uni26B8", "uni26B9", "uni26BA", "uni26BB", "uni26BC", "uni26BD", 
"uni26BE", "uni26BF", "uni26C0", "uni26C1", "uni26C2", "uni26C3", "uni26C4", "uni26C5", "uni26C6", "uni26C7", "uni26C8", "uni26C9", "uni26CA", "uni26CB", 
"uni26CC", "uni26CD", "uni26CE", "uni26CF", "uni26D0", "uni26D1", "uni26D2", "uni26D3", "uni26D4", "uni26D5", "uni26D6", "uni26D7", "uni26D8", "uni26D9", 
"uni26DA", "uni26DB", "uni26DC", "uni26DD", "uni26DE", "uni26DF", "uni26E0", "uni26E1", "uni26E2", "uni26E3", "uni26E4", "uni26E5", "uni26E6", "uni26E7", 
"uni26E8", "uni26E9", "uni26EA", "uni26EB", "uni26EC", "uni26ED", "uni26EE", "uni26EF", "uni26F0", "uni26F1", "uni26F2", "uni26F3", "uni26F4", "uni26F5", 
"uni26F6", "uni26F7", "uni26F8", "uni26F9", "uni26FA", "uni26FB", "uni26FC", "uni26FD", "uni26FE", "uni26FF", "uni2700", "uni2701", "uni2702", "uni2703", 
"uni2704", "uni2705", "uni2706", "uni2707", "uni2708", "uni2709", "uni270A", "uni270B", "uni270C", "uni270D", "uni270E", "uni270F", "uni2710", "uni2711", 
"uni2712", "uni2713", "uni2714", "uni2715", "uni2716", "uni2717", "uni2718", "uni2719", "uni271A", "uni271B", "uni271C", "uni271D", "uni271E", "uni271F", 
"uni2720", "uni2721", "uni2722", "uni2723", "uni2724", "uni2725", "uni2726", "uni2727", "uni2728", "uni2729", "uni272A", "uni272B", "uni272C", "uni272D", 
"uni272E", "uni272F", "uni2730", "uni2731", "uni2732", "uni2733", "uni2734", "uni2735", "uni2736", "uni2737", "uni2738", "uni2739", "uni273A", "uni273B", 
"uni273C", "uni273D", "uni273E", "uni273F", "uni2740", "uni2741", "uni2742", "uni2743", "uni2744", "uni2745", "uni2746", "uni2747", "uni2748", "uni2749", 
"uni274A", "uni274B", "uni274C", "uni274D", "uni274E", "uni274F", "uni2750", "uni2751", "uni2752", "uni2753", "uni2754", "uni2755", "uni2756", "SF100000", "SF110000", "SF010000", "SF030000", "SF020000", "SF040000", "SF080000", "SF090000", "SF060000", "SF070000", "SF050000", "SF430000", "SF240000", "SF510000", "SF520000", "SF390000", "SF220000", "SF210000", "SF250000", "SF500000", "SF490000", "SF380000", "SF280000", "SF270000", "SF260000", "SF360000", "SF370000", "SF420000", "SF190000", "SF200000", "SF230000", "SF470000", "SF480000", "SF410000", "SF450000", "SF460000", "SF400000", "SF540000", "SF530000", "SF440000", "upblock", "dnblock", "block", "lfblock", "rtblock", "ltshade", "shade", "dkshade", "filledbox", "H22073", "H18543", "H18551", "triagup", "triagdn", "lozenge", "circle", "H18533", "openbullet", "female", "male", "spade", "club", "heart", "diamond", "musicalnote", "musicalnotedbl"];

const modifyGlyphs = ["uni322B", "uni4F7D", "uni4FE0", "uni5013", "uni5439", "uni5556", "uni57C9", "uni587D", "uni593E", "uni596D", "uni6063", "uni6101", "uni617E", "uni6798", "uni2F4B", "uni6B23", "uni6B32", "uni6B3A", "uni6B3D", "uni6C6D", "uni6D79", "uni2F55", "uni708A", "uni72C4", "uni72F9", "uni74F7", "uni76DC", "uni7752", "uni7CA2", "uni7FA1", "uni7FA8", "uni803F", "uni80AD", "uni82A1", "uni8328", "uni83A2", "uni8A25", "uni8AC7", "uni8EDF", "uni931F", "uni965C", "uni98EE", "uni59FF", "uni6B21",];

const partialSwap = ["uni32C0", "uni3359", "uni33E0"];

const invertRadius = {
	"uni32C0": [11],
	"uni3359": [11],
	"uni33E0": [11],
	"uni1F18A": [7, 5]
}

const extendSkip = ["uni2702"];
module.exports = {
	modifyGlyphs, negativeGlyphs, partialSwap, invertRadius, skipGlyphs, extendSkip
};