import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';

class ApiService {
  static const String baseUrl = 'https://tontine-backend-1-5fe3.onrender.com';
  static String? _token;

  static Future<void> setToken(String token) async {
    _token = token;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString('token', token);
  }

  static Future<String?> getToken() async {
    if (_token != null) return _token;
    final prefs = await SharedPreferences.getInstance();
    _token = prefs.getString('token');
    return _token;
  }

  static Map<String, String> _getHeaders() {
    return {
      'Content-Type': 'application/json',
      if (_token != null) 'Authorization': 'Bearer $_token',
    };
  }

  // ========== AUTHENTIFICATION ==========
  static Future<Map<String, dynamic>> register(
      String nom, String email, String password, String? telephone, {String role = 'membre'}) async {
    final response = await http.post(
      Uri.parse('$baseUrl/register'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'nom': nom,
        'email': email,
        'password': password,
        'telephone': telephone,
        'role': role,  // Ajout du rôle
      }),
    );

    print('📡 POST register - Status: ${response.statusCode}');
    print('📡 Response: ${response.body}');

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = jsonDecode(response.body);
      await setToken(data['token']);
      return data;
    }
    throw Exception(jsonDecode(response.body)['error']);
  }

  static Future<Map<String, dynamic>> login(String email, String password) async {
    final response = await http.post(
      Uri.parse('$baseUrl/login'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'email': email, 'password': password}),
    );

    print('📡 POST login - Status: ${response.statusCode}');
    print('📡 Response: ${response.body}');

    if (response.statusCode == 200) {
      final Map<String, dynamic> data = jsonDecode(response.body);
      await setToken(data['token']);
      return data;
    }
    throw Exception(jsonDecode(response.body)['error']);
  }

  static Future<void> logout() async {
    _token = null;
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove('token');
  }

  // ========== UTILISATEUR ==========
  static Future<Map<String, dynamic>> getCurrentUser() async {
    final token = await getToken();
    if (token == null || token.isEmpty) {
      throw Exception('Non authentifié');
    }

    final response = await http.get(
      Uri.parse('$baseUrl/me'),
      headers: _getHeaders(),
    );

    print('📡 GET /me - Status: ${response.statusCode}');
    print('📡 Response: ${response.body}');

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    } else if (response.statusCode == 401) {
      await logout();
      throw Exception('Session expirée');
    } else {
      throw Exception('Erreur chargement utilisateur: ${response.body}');
    }
  }

  // ========== TONTINES ==========
  static Future<List<dynamic>> getTontines() async {
    final response = await http.get(
      Uri.parse('$baseUrl/tontines'),
      headers: _getHeaders(),
    );

    print('📡 GET tontines - Status: ${response.statusCode}');

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur chargement tontines: ${response.body}');
  }

  static Future<Map<String, dynamic>> createTontine(Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$baseUrl/tontines'),
      headers: _getHeaders(),
      body: jsonEncode(data),
    );

    print('📡 POST tontine - Status: ${response.statusCode}');

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur création tontine: ${response.body}');
  }

  static Future<Map<String, dynamic>> updateTontine(int id, Map<String, dynamic> data) async {
    final response = await http.put(
      Uri.parse('$baseUrl/tontines/$id'),
      headers: _getHeaders(),
      body: jsonEncode(data),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur modification tontine');
  }

  static Future<void> deleteTontine(int id) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/tontines/$id'),
      headers: _getHeaders(),
    );

    if (response.statusCode != 200) {
      throw Exception('Erreur suppression tontine');
    }
  }

  // ========== MEMBRES ==========
  static Future<List<dynamic>> getMembres(int tontineId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/tontines/$tontineId/membres'),
      headers: _getHeaders(),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur chargement membres');
  }

  static Future<Map<String, dynamic>> createMembre(int tontineId, Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$baseUrl/tontines/$tontineId/membres'),
      headers: _getHeaders(),
      body: jsonEncode(data),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur création membre');
  }

  static Future<void> deleteMembre(int id) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/membres/$id'),
      headers: _getHeaders(),
    );

    if (response.statusCode != 200) {
      throw Exception('Erreur suppression membre');
    }
  }

  // ========== COTISATIONS ==========
  static Future<List<dynamic>> getCotisations(int tontineId) async {
    final response = await http.get(
      Uri.parse('$baseUrl/tontines/$tontineId/cotisations'),
      headers: _getHeaders(),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur chargement cotisations');
  }

  static Future<Map<String, dynamic>> createCotisation(int tontineId, Map<String, dynamic> data) async {
    final response = await http.post(
      Uri.parse('$baseUrl/tontines/$tontineId/cotisations'),
      headers: _getHeaders(),
      body: jsonEncode(data),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur création cotisation');
  }

  static Future<void> deleteCotisation(int id) async {
    final response = await http.delete(
      Uri.parse('$baseUrl/cotisations/$id'),
      headers: _getHeaders(),
    );

    if (response.statusCode != 200) {
      throw Exception('Erreur suppression cotisation');
    }
  }

  // ========== STATISTIQUES ==========
  static Future<Map<String, dynamic>> getStatistiques() async {
    final response = await http.get(
      Uri.parse('$baseUrl/statistiques'),
      headers: _getHeaders(),
    );

    if (response.statusCode == 200) {
      return jsonDecode(response.body);
    }
    throw Exception('Erreur chargement statistiques');
  }
}
